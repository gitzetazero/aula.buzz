import { getUser, json, unauthorized } from "@aula/auth";
import {
  activeAdminCount,
  activeEmails,
  deleteResource,
  deleteUser,
  getResource,
  getUserRow,
  listAudit,
  listResources,
  listUsers,
  logAction,
  parseResource,
  putResource,
  setSetting,
  upsertUser,
} from "@aula/db";
import { z } from "zod";
import type { Env } from "../env.ts";
import { syncAccessPolicy } from "../lib/access.ts";
import { getDriveToken, parseServiceAccount, SCOPE_WRITE } from "../lib/gdrive.ts";
import { deleteRelease, ensureRelease, githubStatus } from "../lib/github.ts";
import { getAnnouncement, getMirrors, getSections, type SectionSetting } from "../lib/settings.ts";
import { currentRole } from "./public.ts";

const forbidden = () => json({ error: "Solo para administradores" }, { status: 403 });
const bad = (message: string) => json({ error: message }, { status: 400 });

const emailSchema = z.string().trim().toLowerCase().email().max(254);
const roleSchema = z.enum(["admin", "student"]);

/** Comprueba sesión y rol de admin; devuelve el email o la respuesta de error. */
async function guard(request: Request, env: Env): Promise<string | Response> {
  const user = await getUser(request, env);
  if (!user) return unauthorized();
  if ((await currentRole(env, user.email)) !== "admin") return forbidden();
  return user.email;
}

async function syncNow(env: Env) {
  return syncAccessPolicy(env, await activeEmails(env.DB));
}

export async function handleAdmin(request: Request, env: Env, path: string[]): Promise<Response> {
  const who = await guard(request, env);
  if (who instanceof Response) return who;
  const method = request.method;
  const [section, a] = path;
  const body = async () => (await request.json().catch(() => null)) as Record<string, unknown> | null;

  // ---------- usuarios ----------
  if (section === "users") {
    if (!a && method === "GET") return json({ users: await listUsers(env.DB) });

    if (!a && method === "POST") {
      const input = z.object({ email: emailSchema, role: roleSchema.default("student") }).safeParse(await body());
      if (!input.success) return bad("Email o rol no válidos");
      await upsertUser(env.DB, input.data.email, input.data.role, true);
      await logAction(env.DB, who, "usuario.alta", input.data.email);
      return json({ ok: true, access: await syncNow(env) });
    }

    if (a && (method === "PATCH" || method === "DELETE")) {
      const email = emailSchema.safeParse(decodeURIComponent(a));
      if (!email.success) return bad("Email no válido");
      const row = await getUserRow(env.DB, email.data);
      if (!row) return json({ error: "Usuario desconocido" }, { status: 404 });

      if (method === "DELETE") {
        if (row.role === "admin" && row.active && (await activeAdminCount(env.DB)) <= 1) {
          return bad("No puedes eliminar al último administrador");
        }
        await deleteUser(env.DB, row.email);
        await logAction(env.DB, who, "usuario.baja", row.email);
      } else {
        const input = z.object({ role: roleSchema.optional(), active: z.boolean().optional() }).safeParse(await body());
        if (!input.success) return bad("Datos no válidos");
        const role = input.data.role ?? row.role;
        const active = input.data.active ?? row.active;
        const losesAdmin = row.role === "admin" && row.active && (role !== "admin" || !active);
        if (losesAdmin && (await activeAdminCount(env.DB)) <= 1) return bad("Debe quedar al menos un administrador activo");
        await upsertUser(env.DB, row.email, role, active);
        await logAction(env.DB, who, "usuario.cambio", `${row.email} → ${role}${active ? "" : " (inactivo)"}`);
      }
      return json({ ok: true, access: await syncNow(env) });
    }
  }

  // ---------- recursos ----------
  if (section === "resources") {
    if (!a && method === "GET") return json({ recursos: await listResources(env.DB) });

    if (a && method === "PUT") {
      let resource;
      try {
        resource = parseResource(await body());
      } catch (error) {
        const issues =
          error instanceof z.ZodError ? error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : "Recurso no válido";
        return bad(issues);
      }
      if (resource.id !== decodeURIComponent(a)) return bad("El id no coincide con la ruta");
      const existed = await getResource(env.DB, resource.id);
      await putResource(env.DB, resource);
      await logAction(env.DB, who, existed ? "recurso.edicion" : "recurso.alta", resource.id);
      return json({ ok: true });
    }

    if (a && method === "DELETE") {
      const id = decodeURIComponent(a);
      const resource = await getResource(env.DB, id);
      if (!resource) return json({ error: "Recurso desconocido" }, { status: 404 });
      const report: Record<string, string> = {};
      if (new URL(request.url).searchParams.get("mirrors") === "1") {
        report.github = await deleteFromGithub(env, id, resource.partes.some((p) => p.github_asset_id));
        report.drive = await deleteFromDrive(
          env,
          resource.partes.map((p) => p.drive_id).filter((x): x is string => Boolean(x)),
        );
      }
      await deleteResource(env.DB, id);
      await logAction(env.DB, who, "recurso.baja", id);
      return json({ ok: true, mirrors: report });
    }
  }

  // ---------- actividad ----------
  if (section === "activity" && method === "GET") {
    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 200) || 200, 1000);
    const rows = await listAudit(env.DB, limit, Number(url.searchParams.get("offset") ?? 0) || 0);
    if (a === "csv") {
      const esc = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
      const csv = [
        "id,fecha,email,accion,objetivo",
        ...rows.map((r) => [r.id, r.ts, r.email, r.action, r.target].map(esc).join(",")),
      ].join("\n");
      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="actividad.csv"',
          "Cache-Control": "no-store",
        },
      });
    }
    return json({ actividad: rows });
  }

  // ---------- mirrors ----------
  if (section === "mirrors" && method === "GET") {
    return json({
      orden: await getMirrors(env),
      drive: await driveStatus(env),
      github: await githubStatus(env),
      access: accessConfigured(env),
    });
  }

  // ---------- ajustes ----------
  if (section === "settings") {
    if (method === "GET") {
      return json({ sections: await getSections(env), announcement: await getAnnouncement(env), mirrors: await getMirrors(env) });
    }
    if (method === "PUT") {
      const input = z
        .object({
          sections: z
            .array(
              z.object({
                id: z.string().regex(/^[a-z0-9-]+$/),
                nombre: z.string().min(1).max(60),
                descripcion: z.string().max(300),
                url: z.string().regex(/^\/(?!\/)/, "Ruta interna").optional(),
                visible: z.boolean(),
              }),
            )
            .optional(),
          announcement: z.string().max(500).optional(),
          mirrors: z.array(z.enum(["drive", "github"])).min(1).optional(),
        })
        .safeParse(await body());
      if (!input.success) return bad("Ajustes no válidos");
      if (input.data.sections) await setSetting(env.DB, "sections", input.data.sections satisfies SectionSetting[]);
      if (input.data.announcement !== undefined) await setSetting(env.DB, "announcement", input.data.announcement);
      if (input.data.mirrors) await setSetting(env.DB, "mirrors", input.data.mirrors);
      await logAction(env.DB, who, "ajustes.cambio", Object.keys(input.data).join(","));
      return json({ ok: true });
    }
  }

  // ---------- subida desde el navegador ----------
  if (section === "upload" && method === "POST") {
    const input = await body();
    if (a === "github") {
      if (!env.GH_UPLOAD_TOKEN || !env.GH_ASSETS_REPO) {
        return json({ error: "Falta GH_UPLOAD_TOKEN (token con Contents: write)" }, { status: 503 });
      }
      const id = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).safeParse(input?.id);
      if (!id.success) return bad("id no válido");
      const releaseId = await ensureRelease(env, id.data, typeof input?.nombre === "string" ? input.nombre : id.data);
      await logAction(env.DB, who, "subida.github", id.data);
      // El token sale al navegador del admin: es la decisión de diseño acordada.
      return json({ repo: env.GH_ASSETS_REPO, releaseId, token: env.GH_UPLOAD_TOKEN });
    }
    if (a === "drive") {
      if (!env.GDRIVE_SA_JSON || !env.GDRIVE_FOLDER_ID) {
        return json({ error: "Falta GDRIVE_FOLDER_ID o GDRIVE_SA_JSON" }, { status: 503 });
      }
      const name = z.string().min(1).max(200).safeParse(input?.name);
      const size = z.number().int().positive().safeParse(input?.size);
      if (!name.success || !size.success) return bad("Nombre o tamaño no válidos");
      const { token } = await getDriveToken(parseServiceAccount(env.GDRIVE_SA_JSON), Date.now(), SCOPE_WRITE);
      const init = await fetch(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json; charset=UTF-8",
            "X-Upload-Content-Length": String(size.data),
            Origin: new URL(request.url).origin,
          },
          body: JSON.stringify({ name: name.data, parents: [env.GDRIVE_FOLDER_ID] }),
        },
      );
      const sessionUrl = init.headers.get("Location");
      if (!init.ok || !sessionUrl) return json({ error: `Drive rechazó la subida (${init.status})` }, { status: 502 });
      await logAction(env.DB, who, "subida.drive", name.data);
      return json({ sessionUrl });
    }
  }

  return json({ error: "No encontrado" }, { status: 404 });
}

function accessConfigured(env: Env) {
  return Boolean(env.CF_API_TOKEN && env.CF_ACCOUNT_ID && env.ACCESS_APP_ID && env.ACCESS_POLICY_ID);
}

async function driveStatus(env: Env): Promise<{ ok: boolean; detail: string }> {
  if (!env.GDRIVE_SA_JSON) return { ok: false, detail: "No configurado" };
  try {
    const { token } = await getDriveToken(parseServiceAccount(env.GDRIVE_SA_JSON));
    const about = await fetch("https://www.googleapis.com/drive/v3/about?fields=storageQuota", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!about.ok) return { ok: false, detail: `Drive respondió ${about.status}` };
    const q = ((await about.json()) as { storageQuota?: { usage?: string; limit?: string } }).storageQuota ?? {};
    const gib = (v?: string) => (v ? `${(Number(v) / 1024 ** 3).toFixed(1)} GiB` : "sin límite");
    const upload = env.GDRIVE_FOLDER_ID ? "subida habilitada" : "falta GDRIVE_FOLDER_ID (solo lectura)";
    return { ok: true, detail: `Cuenta de servicio: usa ${gib(q.usage)} de ${gib(q.limit)}; ${upload}` };
  } catch {
    return { ok: false, detail: "No se pudo autenticar con Google" };
  }
}

async function deleteFromGithub(env: Env, id: string, hadAssets: boolean): Promise<string> {
  if (!hadAssets) return "sin archivos";
  if (!env.GH_UPLOAD_TOKEN || !env.GH_ASSETS_REPO) return "no se pudo (falta GH_UPLOAD_TOKEN)";
  try {
    return (await deleteRelease(env, id)) ? "borrado" : "no se pudo borrar";
  } catch {
    return "error";
  }
}

async function deleteFromDrive(env: Env, ids: string[]): Promise<string> {
  if (!ids.length) return "sin archivos";
  if (!env.GDRIVE_SA_JSON) return "no se pudo (sin configurar)";
  try {
    const { token } = await getDriveToken(parseServiceAccount(env.GDRIVE_SA_JSON), Date.now(), SCOPE_WRITE);
    let failed = 0;
    for (const id of ids) {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?supportsAllDrives=true`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok && res.status !== 404) failed++;
    }
    return failed ? `${failed} archivo(s) no se pudieron borrar` : "borrado";
  } catch {
    return "error";
  }
}
