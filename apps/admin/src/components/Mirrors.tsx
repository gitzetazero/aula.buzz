import { useEffect, useState } from "preact/hooks";
import { api } from "../lib/api.ts";

interface Status {
  orden: string[];
  drive: { ok: boolean; detail: string };
  github: { ok: boolean; detail: string };
  access: boolean;
}

export default function Mirrors() {
  const [s, setS] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  const load = () =>
    api<Status>("mirrors").then((r) => {
      setS(r);
      setOrder(r.orden);
    }, (e: Error) => setError(e.message));
  useEffect(() => void load(), []);

  const row = (name: string, label: string, st: { ok: boolean; detail: string }) => (
    <tr>
      <td>{label}</td>
      <td>{st.ok ? <span class="ok">Responde</span> : <span class="ko">Con problemas</span>}</td>
      <td class="muted">{st.detail}</td>
      <td>
        <label>
          <input
            type="checkbox"
            checked={order.includes(name)}
            onChange={(e) => {
              setSaved(false);
              setOrder(e.currentTarget.checked ? [...order, name] : order.filter((m) => m !== name));
            }}
          />{" "}
          Activo
        </label>
      </td>
    </tr>
  );

  async function save() {
    await api("settings", { method: "PUT", body: { mirrors: order } }).then(() => setSaved(true), (e: Error) => setError(e.message));
  }

  if (error) return <p class="notice notice--error" role="alert">{error}</p>;
  if (!s) return <p class="muted">Comprobando mirrors…</p>;
  return (
    <div class="stack">
      <table class="table">
        <thead><tr><th>Mirror</th><th>Estado</th><th>Detalle</th><th></th></tr></thead>
        <tbody>
          {row("drive", "Google Drive", s.drive)}
          {row("github", "GitHub Releases", s.github)}
        </tbody>
      </table>
      <div class="row">
        <span>Orden de prueba en las descargas:</span>
        <strong>{order.length ? order.join(" → ") : "ninguno"}</strong>
        <button class="btn btn--small" disabled={order.length < 2} onClick={() => { setSaved(false); setOrder([...order].reverse()); }}>Invertir</button>
        <button class="btn btn--primary btn--small" disabled={order.length === 0} onClick={save}>Guardar</button>
        {saved && <span class="ok">Guardado</span>}
      </div>
      <p class={s.access ? "ok" : "muted"}>
        Sincronización con Cloudflare Access: {s.access ? "configurada" : "sin configurar (los cambios de usuarios no llegan a Access)"}
      </p>
      <button class="btn btn--small" onClick={() => { setS(null); load(); }}>Volver a comprobar</button>
    </div>
  );
}
