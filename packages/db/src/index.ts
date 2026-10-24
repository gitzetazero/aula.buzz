// Acceso a D1: usuarios, catálogo, auditoría y ajustes.
import { resourceSchema, type Resource } from "./schema.ts";

export * from "./schema.ts";

export type Role = "admin" | "student";
export interface UserRow {
  email: string;
  role: Role;
  active: boolean;
  created_at: string;
}

const norm = (email: string) => email.trim().toLowerCase();

// ---------- usuarios ----------

export async function getUserRow(db: D1Database, email: string): Promise<UserRow | null> {
  const row = await db
    .prepare("SELECT email, role, active, created_at FROM users WHERE email = ?")
    .bind(norm(email))
    .first<{ email: string; role: Role; active: number; created_at: string }>();
  return row ? { ...row, active: row.active === 1 } : null;
}

export async function isAdmin(db: D1Database, email: string): Promise<boolean> {
  const u = await getUserRow(db, email);
  return Boolean(u && u.active && u.role === "admin");
}

export async function listUsers(db: D1Database): Promise<UserRow[]> {
  const { results } = await db
    .prepare("SELECT email, role, active, created_at FROM users ORDER BY role, email")
    .all<{ email: string; role: Role; active: number; created_at: string }>();
  return results.map((r) => ({ ...r, active: r.active === 1 }));
}

export async function upsertUser(db: D1Database, email: string, role: Role, active: boolean): Promise<void> {
  await db
    .prepare(
      "INSERT INTO users (email, role, active) VALUES (?1, ?2, ?3) ON CONFLICT(email) DO UPDATE SET role = ?2, active = ?3",
    )
    .bind(norm(email), role, active ? 1 : 0)
    .run();
}

export async function deleteUser(db: D1Database, email: string): Promise<void> {
  await db.prepare("DELETE FROM users WHERE email = ?").bind(norm(email)).run();
}

export async function activeAdminCount(db: D1Database): Promise<number> {
  const r = await db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1").first<{ n: number }>();
  return r?.n ?? 0;
}

/** Emails que deben estar en la política de Access. */
export async function activeEmails(db: D1Database): Promise<string[]> {
  const { results } = await db.prepare("SELECT email FROM users WHERE active = 1 ORDER BY email").all<{ email: string }>();
  return results.map((r) => r.email);
}

// ---------- catálogo ----------

/** Recurso tal cual se guarda: `actualizado` como cadena ISO. */
export type StoredResource = Omit<Resource, "actualizado"> & { actualizado: string };

export function parseResource(input: unknown): StoredResource {
  const r = resourceSchema.parse(input);
  return { ...r, actualizado: r.actualizado.toISOString().slice(0, 10) };
}

export async function listResources(db: D1Database): Promise<StoredResource[]> {
  const { results } = await db.prepare("SELECT data FROM resources ORDER BY updated DESC, id").all<{ data: string }>();
  return results.map((r) => JSON.parse(r.data) as StoredResource);
}

export async function getResource(db: D1Database, id: string): Promise<StoredResource | null> {
  const row = await db.prepare("SELECT data FROM resources WHERE id = ?").bind(id).first<{ data: string }>();
  return row ? (JSON.parse(row.data) as StoredResource) : null;
}

export async function putResource(db: D1Database, resource: StoredResource): Promise<void> {
  await db
    .prepare("INSERT INTO resources (id, data, updated) VALUES (?1, ?2, ?3) ON CONFLICT(id) DO UPDATE SET data = ?2, updated = ?3")
    .bind(resource.id, JSON.stringify(resource), resource.actualizado)
    .run();
}

export async function deleteResource(db: D1Database, id: string): Promise<void> {
  await db.prepare("DELETE FROM resources WHERE id = ?").bind(id).run();
}

/** ¿Algún recurso usa este asset de GitHub? (el proxy solo sirve assets del catálogo) */
export async function hasGithubAsset(db: D1Database, assetId: number): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 AS ok FROM resources, json_each(json_extract(data, '$.partes')) AS p WHERE json_extract(p.value, '$.github_asset_id') = ? LIMIT 1")
    .bind(assetId)
    .first();
  return Boolean(row);
}

// ---------- auditoría ----------

export async function logAction(db: D1Database, email: string, action: string, target?: string): Promise<void> {
  await db.prepare("INSERT INTO audit (email, action, target) VALUES (?, ?, ?)").bind(email, action, target ?? null).run();
}

export interface AuditRow {
  id: number;
  ts: string;
  email: string;
  action: string;
  target: string | null;
}

export async function listAudit(db: D1Database, limit = 200, offset = 0): Promise<AuditRow[]> {
  const { results } = await db
    .prepare("SELECT id, ts, email, action, target FROM audit ORDER BY id DESC LIMIT ? OFFSET ?")
    .bind(limit, offset)
    .all<AuditRow>();
  return results;
}

// ---------- ajustes ----------

export async function getSetting<T>(db: D1Database, key: string): Promise<T | null> {
  const row = await db.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first<{ value: string }>();
  return row ? (JSON.parse(row.value) as T) : null;
}

export async function setSetting(db: D1Database, key: string, value: unknown): Promise<void> {
  await db
    .prepare("INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?2")
    .bind(key, JSON.stringify(value))
    .run();
}
