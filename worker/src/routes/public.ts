import { getUser, json, unauthorized } from "@aula/auth";
import { getUserRow } from "@aula/db";
import type { Env } from "../env.ts";
import { getAnnouncement, getSections } from "../lib/settings.ts";

/** Rol del usuario según D1 (fuera de D1 no es admin; Access ya filtró el acceso). */
export function isOwner(env: Env, email: string): boolean {
  return Boolean(env.OWNER_EMAIL) && env.OWNER_EMAIL!.trim().toLowerCase() === email.trim().toLowerCase();
}

export async function currentRole(env: Env, email: string): Promise<"admin" | "student"> {
  if (isOwner(env, email)) return "admin"; // el principal nunca se queda fuera aunque falte su fila en D1
  const row = await getUserRow(env.DB, email);
  return row?.active && row.role === "admin" ? "admin" : "student";
}

export async function me(request: Request, env: Env): Promise<Response> {
  const user = await getUser(request, env);
  if (!user) return unauthorized();
  return json({ email: user.email, role: await currentRole(env, user.email) });
}

export async function settings(request: Request, env: Env): Promise<Response> {
  if (!(await getUser(request, env))) return unauthorized();
  const [sections, announcement] = await Promise.all([getSections(env), getAnnouncement(env)]);
  return json({ sections: sections.filter((s) => s.visible), announcement });
}
