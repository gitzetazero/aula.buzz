import { getUser, json, unauthorized } from "@aula/auth";
import { MIRRORS, getParts } from "../_lib/catalog.ts";
import type { Env } from "../_lib/env.ts";
import { parseServiceAccount } from "../_lib/gdrive.ts";
import { buildSources } from "../_lib/tickets.ts";

/** POST { id, part } → { sources: [{ mirror, url, headers? }] } */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await getUser(request, env))) return unauthorized();

  const body = (await request.json().catch(() => null)) as { id?: unknown; part?: unknown } | null;
  if (typeof body?.id !== "string" || !Number.isInteger(body.part)) {
    return json({ error: "Petición no válida" }, { status: 400 });
  }
  const part = getParts(body.id)?.[body.part as number];
  if (!part) return json({ error: "Recurso o parte desconocidos" }, { status: 404 });

  let driveAccount;
  try {
    driveAccount = env.GDRIVE_SA_JSON ? parseServiceAccount(env.GDRIVE_SA_JSON) : undefined;
  } catch {
    driveAccount = undefined;
  }
  const sources = await buildSources(part, MIRRORS, {
    driveAccount,
    githubConfigured: Boolean(env.GH_ASSETS_TOKEN && env.GH_ASSETS_REPO),
  });
  if (!sources.length) return json({ error: "No hay mirrors disponibles para esta parte" }, { status: 503 });
  return json({ sources });
};
