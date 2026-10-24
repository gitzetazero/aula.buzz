import { useEffect, useState } from "preact/hooks";
import { api, type AccessResult, type UserRow } from "../lib/api.ts";

export default function Users() {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"student" | "admin">("student");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const load = () => api<{ users: UserRow[] }>("users").then((r) => setUsers(r.users));
  useEffect(() => {
    load().catch((e: Error) => setMessage({ kind: "error", text: e.message }));
  }, []);

  async function run(action: () => Promise<{ access?: AccessResult }>, okText: string) {
    setMessage(null);
    try {
      const r = await action();
      await load();
      const sync = r.access && !r.access.synced ? ` Ojo: ${r.access.detail ?? "Access no se actualizó"}.` : " Access actualizado.";
      setMessage({ kind: r.access && !r.access.synced ? "error" : "ok", text: okText + sync });
    } catch (e) {
      setMessage({ kind: "error", text: (e as Error).message });
    }
  }

  const patch = (u: UserRow, body: Partial<Pick<UserRow, "role" | "active">>, text: string) =>
    run(() => api(`users/${encodeURIComponent(u.email)}`, { method: "PATCH", body }), text);

  return (
    <div class="stack">
      <form
        class="row"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => api("users", { method: "POST", body: { email, role } }), `${email} añadido.`).then(() => setEmail(""));
        }}
      >
        <input type="email" required placeholder="alumno@ejemplo.com" aria-label="Email" value={email} onInput={(e) => setEmail(e.currentTarget.value)} />
        <select aria-label="Rol" value={role} onChange={(e) => setRole(e.currentTarget.value as "student" | "admin")}>
          <option value="student">Alumno</option>
          <option value="admin">Administrador</option>
        </select>
        <button class="btn btn--primary" type="submit">Añadir</button>
      </form>
      {message && <p class={`notice ${message.kind === "error" ? "notice--error" : ""}`} role="status">{message.text}</p>}
      {!users ? (
        <p class="muted">Cargando…</p>
      ) : (
        <table class="table">
          <thead><tr><th>Email</th><th>Rol</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.email}>
                <td>{u.email}</td>
                <td><span class="badge">{u.owner ? "Admin principal" : u.role === "admin" ? "Admin" : "Alumno"}</span></td>
                <td>{u.active ? <span class="ok">Activo</span> : <span class="muted">Desactivado</span>}</td>
                <td class="actions">
                  {u.owner ? <span class="muted">Protegido</span> : <>
                  <button class="btn btn--small" onClick={() => patch(u, { role: u.role === "admin" ? "student" : "admin" }, `Rol de ${u.email} cambiado.`)}>
                    {u.role === "admin" ? "Quitar admin" : "Hacer admin"}
                  </button>
                  <button class="btn btn--small" onClick={() => patch(u, { active: !u.active }, `${u.email} ${u.active ? "desactivado" : "activado"}.`)}>
                    {u.active ? "Desactivar" : "Activar"}
                  </button>
                  <button
                    class="btn btn--small btn--ghost"
                    onClick={() => confirm(`¿Eliminar a ${u.email}?`) && run(() => api(`users/${encodeURIComponent(u.email)}`, { method: "DELETE" }), `${u.email} eliminado.`)}
                  >
                    Eliminar
                  </button>
                  </>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p class="muted">Los usuarios activos son los que entran por Cloudflare Access. Quitar a alguien no cierra su sesión actual hasta que caduque (24 h).</p>
    </div>
  );
}
