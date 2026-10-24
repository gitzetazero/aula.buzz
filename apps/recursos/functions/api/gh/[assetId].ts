import { getUser, unauthorized, json } from "@aula/auth";
import { hasGithubAsset } from "../../_lib/catalog.ts";
import type { Env } from "../../_lib/env.ts";

const PASS_THROUGH = ["Content-Type", "Content-Length", "Content-Range", "Accept-Ranges", "Content-Disposition"];

/**
 * Proxy en streaming de un asset de un release privado de GitHub. GitHub no
 * envía CORS en sus URLs firmadas, así que el navegador no podría leerlas
 * directamente para escribir en el USB.
 */
export const onRequestGet: PagesFunction<Env, "assetId"> = async ({ request, env, params }) => {
  if (!(await getUser(request, env))) return unauthorized();
  if (!env.GH_ASSETS_TOKEN || !env.GH_ASSETS_REPO) return json({ error: "GitHub no está configurado" }, { status: 503 });

  const assetId = Number(params.assetId);
  if (!Number.isInteger(assetId) || !hasGithubAsset(assetId)) return json({ error: "Asset desconocido" }, { status: 404 });

  const range = request.headers.get("Range");
  const api = await fetch(`https://api.github.com/repos/${env.GH_ASSETS_REPO}/releases/assets/${assetId}`, {
    redirect: "manual",
    headers: {
      Authorization: `Bearer ${env.GH_ASSETS_TOKEN}`,
      Accept: "application/octet-stream",
      "User-Agent": "aula.buzz",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  const location = api.headers.get("Location");
  if (api.status !== 302 || !location) return json({ error: "GitHub no devolvió el archivo" }, { status: 502 });

  // La URL firmada ya lleva credenciales: no se le envía el token.
  const upstream = await fetch(location, { headers: range ? { Range: range } : {} });
  const headers = new Headers({ "Cache-Control": "no-store" });
  for (const name of PASS_THROUGH) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
};
