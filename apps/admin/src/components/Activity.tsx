import { useEffect, useState } from "preact/hooks";
import { api } from "../lib/api.ts";

interface Row {
  id: number;
  ts: string;
  email: string;
  action: string;
  target: string | null;
}

export default function Activity() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () =>
    api<{ actividad: Row[] }>("activity?limit=300").then((r) => setRows(r.actividad), (e: Error) => setError(e.message));
  useEffect(() => void load(), []);

  return (
    <div class="stack">
      <div class="actions">
        <button class="btn btn--small" onClick={load}>Actualizar</button>
        <a class="btn btn--small" href="/api/admin/activity/csv?limit=1000" download>Exportar CSV</a>
      </div>
      {error && <p class="notice notice--error" role="alert">{error}</p>}
      {!rows && !error && <p class="muted">Cargando…</p>}
      {rows && rows.length === 0 && <p class="muted">Todavía no hay actividad.</p>}
      {rows && rows.length > 0 && (
        <table class="table">
          <thead><tr><th>Fecha (UTC)</th><th>Usuario</th><th>Acción</th><th>Objetivo</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}><td>{r.ts}</td><td>{r.email}</td><td>{r.action}</td><td>{r.target}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
