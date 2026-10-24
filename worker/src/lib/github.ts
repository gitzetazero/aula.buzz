import type { Env } from "../env.ts";

const BASE_HEADERS = { "User-Agent": "aula.buzz", "X-GitHub-Api-Version": "2022-11-28", Accept: "application/vnd.github+json" };

async function gh(env: Env, token: string, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`https://api.github.com${path}`, {
    ...init,
    headers: { ...BASE_HEADERS, Authorization: `Bearer ${token}`, ...(init.headers as Record<string, string>) },
  });
}

/** Devuelve el id del release con ese tag, creándolo si no existe. */
export async function ensureRelease(env: Env, tag: string, title: string): Promise<number> {
  const token = env.GH_UPLOAD_TOKEN!;
  const existing = await gh(env, token, `/repos/${env.GH_ASSETS_REPO}/releases/tags/${encodeURIComponent(tag)}`);
  if (existing.ok) return ((await existing.json()) as { id: number }).id;
  const created = await gh(env, token, `/repos/${env.GH_ASSETS_REPO}/releases`, {
    method: "POST",
    body: JSON.stringify({ tag_name: tag, name: title, body: `Recurso ${tag}` }),
  });
  if (!created.ok) throw new Error(`GitHub no pudo crear el release (${created.status})`);
  return ((await created.json()) as { id: number }).id;
}

/** Borra el release (y con él todos sus assets). */
export async function deleteRelease(env: Env, tag: string): Promise<boolean> {
  const token = env.GH_UPLOAD_TOKEN!;
  const rel = await gh(env, token, `/repos/${env.GH_ASSETS_REPO}/releases/tags/${encodeURIComponent(tag)}`);
  if (!rel.ok) return rel.status === 404;
  const { id } = (await rel.json()) as { id: number };
  const del = await gh(env, token, `/repos/${env.GH_ASSETS_REPO}/releases/${id}`, { method: "DELETE" });
  return del.status === 204;
}

export async function githubStatus(env: Env): Promise<{ ok: boolean; detail: string }> {
  if (!env.GH_ASSETS_TOKEN || !env.GH_ASSETS_REPO) return { ok: false, detail: "No configurado" };
  const res = await gh(env, env.GH_ASSETS_TOKEN, `/repos/${env.GH_ASSETS_REPO}`);
  if (!res.ok) return { ok: false, detail: `GitHub respondió ${res.status}` };
  const repo = (await res.json()) as { size: number; private: boolean };
  const remaining = res.headers.get("x-ratelimit-remaining");
  const write = env.GH_UPLOAD_TOKEN ? "subida habilitada" : "falta GH_UPLOAD_TOKEN (solo lectura)";
  return { ok: true, detail: `${repo.private ? "Repo privado" : "Repo público"}, ${Math.round(repo.size / 1024)} MiB, ${write}${remaining ? `, límite restante ${remaining}` : ""}` };
}
