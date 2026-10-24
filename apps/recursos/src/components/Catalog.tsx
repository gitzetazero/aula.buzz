import { useEffect, useMemo, useState } from "preact/hooks";
import { loadCatalog, toClient, type CatalogResource } from "../lib/api.ts";
import { formatBytes, matchesQuery, TIPO_LABEL } from "../lib/format.ts";
import Dock from "./downloader/Dock.tsx";
import DownloadButton from "./downloader/DownloadButton.tsx";

const base = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Catalog() {
  const [items, setItems] = useState<CatalogResource[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [asignatura, setAsignatura] = useState("");
  const [tipo, setTipo] = useState("");

  useEffect(() => {
    loadCatalog().then(setItems, (e: Error) => setError(e.message));
  }, []);

  const asignaturas = useMemo(
    () => [...new Set((items ?? []).map((r) => r.asignatura))].sort((a, b) => a.localeCompare(b, "es")),
    [items],
  );
  const tipos = useMemo(() => [...new Set((items ?? []).map((r) => r.tipo))], [items]);
  const visible = (items ?? []).filter(
    (r) =>
      matchesQuery([r.nombre, r.descripcion, r.asignatura, r.so ?? "", ...r.tags].join(" "), q) &&
      (!asignatura || r.asignatura === asignatura) &&
      (!tipo || r.tipo === tipo),
  );

  return (
    <div class="layout">
      <section aria-label="Catálogo">
        <form class="filters" role="search" onSubmit={(e) => e.preventDefault()}>
          <input type="search" placeholder="Buscar: kali, redes, ubuntu…" aria-label="Buscar" value={q} onInput={(e) => setQ(e.currentTarget.value)} />
          <select aria-label="Asignatura" value={asignatura} onChange={(e) => setAsignatura(e.currentTarget.value)}>
            <option value="">Todas las asignaturas</option>
            {asignaturas.map((a) => <option value={a}>{a}</option>)}
          </select>
          <select aria-label="Tipo" value={tipo} onChange={(e) => setTipo(e.currentTarget.value)}>
            <option value="">Todos los tipos</option>
            {tipos.map((t) => <option value={t}>{TIPO_LABEL[t] ?? t}</option>)}
          </select>
        </form>

        {error && <p class="notice notice--error" role="alert">{error}</p>}
        {!items && !error && <p class="muted">Cargando…</p>}
        {items && items.length === 0 && <p class="muted">Todavía no hay recursos publicados.</p>}
        {items && items.length > 0 && visible.length === 0 && <p class="muted">Ningún recurso coincide con la búsqueda.</p>}

        <ul class="cards">
          {visible.map((r) => (
            <li class="card resource" key={r.id}>
              <div class="resource__meta">
                <span class="badge">{TIPO_LABEL[r.tipo] ?? r.tipo}</span>
                <span class="muted">{r.asignatura}</span>
              </div>
              <h2><a href={`${base}/ver/?id=${encodeURIComponent(r.id)}`}>{r.nombre}</a></h2>
              <p class="muted">{r.descripcion}</p>
              <p class="muted resource__facts">
                {formatBytes(r.archivo.tamano)}
                {r.so && ` · ${r.so}`}
                {r.partes.length > 1 && ` · ${r.partes.length} partes`}
              </p>
              <DownloadButton resource={toClient(r)} directUrl={r.directUrl} />
            </li>
          ))}
        </ul>
      </section>
      <Dock />
    </div>
  );
}
