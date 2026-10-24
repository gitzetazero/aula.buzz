import { getUser, json, unauthorized } from "@aula/auth";
import { getResource, hasGithubAsset, listResources, logAction, type StoredResource } from "@aula/db";
import type { Env } from "../env.ts";
import { parseServiceAccount } from "../lib/gdrive.ts";
import { getMirrors } from "../lib/settings.ts";
import { buildSources } from "../lib/tickets.ts";

const PASS_THROUGH = ["Content-Type", "Content-Length", "Content-Range", "Accept-Ranges", "Content-Disposition"];

/** Versión pública: sin ids de los mirrors, con la URL de descarga directa ya calculada. */
function publicView(r: StoredResource) {
  const { partes, ...rest } = r;
  const only = partes.length === 1 ? partes[0] : undefined;
  return {
    ...rest,
    partes: partes.map((p) => ({ tamano: p.tamano, sha256: p.sha256 })),
    directUrl: only?.github_asset_id ? `/api/recursos/gh/${only.github_asset_id}` : undefined,
  };
}

export async function catalog(request: Request, env: Env): Promise<Response> {
  if (!(await getUser(request, env))) return unauthorized();
  return json({ recursos: (await listResources(env.DB)).map(publicView) });
}

export async function catalogOne(request: Request, env: Env, id: string): Promise<Response> {
  if (!(await getUser(request, env))) return unauthorized();
  const r = await getResource(env.DB, id);
  return r ? json(publicView(r)) : json({ error: "Recurso desconocido" }, { status: 404 });
}

/** POST { id, part } → { sources: [{ mirror, url, headers? }] } */
export async function ticket(request: Request, env: Env): Promise<Response> {
  const user = await getUser(request, env);
  if (!user) return unauthorized();

  const body = (await request.json().catch(() => null)) as { id?: unknown; part?: unknown } | null;
  if (typeof body?.id !== "string" || !Number.isInteger(body.part)) {
    return json({ error: "Petición no válida" }, { status: 400 });
  }
  const resource = await getResource(env.DB, body.id);
  const part = resource?.partes[body.part as number];
  if (!part) return json({ error: "Recurso o parte desconocidos" }, { status: 404 });

  let driveAccount;
  try {
    driveAccount = env.GDRIVE_SA_JSON ? parseServiceAccount(env.GDRIVE_SA_JSON) : undefined;
  } catch {
    driveAccount = undefined;
  }
  const sources = await buildSources(part, await getMirrors(env), {
    driveAccount,
    githubConfigured: Boolean(env.GH_ASSETS_TOKEN && env.GH_ASSETS_REPO),
  });
  if (!sources.length) return json({ error: "No hay mirrors disponibles para esta parte" }, { status: 503 });
  if (body.part === 0) await logAction(env.DB, user.email, "descarga", body.id);
  return json({ sources });
}

/**
 * Proxy en streaming de un asset de un release privado de GitHub. GitHub no
 * envía CORS en sus URLs firmadas, así que el navegador no podría leerlas
 * directamente para escribir en el USB.
 */
export async function githubAsset(request: Request, env: Env, rawId: string): Promise<Response> {
  if (!(await getUser(request, env))) return unauthorized();
  if (!env.GH_ASSETS_TOKEN || !env.GH_ASSETS_REPO) return json({ error: "GitHub no está configurado" }, { status: 503 });

  const assetId = Number(rawId);
  if (!Number.isInteger(assetId) || !(await hasGithubAsset(env.DB, assetId))) {
    return json({ error: "Asset desconocido" }, { status: 404 });
  }

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
}
