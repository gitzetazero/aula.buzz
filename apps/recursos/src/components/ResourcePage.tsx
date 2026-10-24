import { marked } from "marked";
import { useEffect, useState } from "preact/hooks";
import { loadResource, toClient, type CatalogResource } from "../lib/api.ts";
import { formatBytes, TIPO_LABEL } from "../lib/format.ts";
import Dock from "./downloader/Dock.tsx";
import DownloadButton from "./downloader/DownloadButton.tsx";

export default function ResourcePage() {
  const [r, setR] = useState<CatalogResource | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = new URLSearchParams(location.search).get("id");
    if (!id) return setError("Falta el recurso.");
    loadResource(id).then(
      (res) => {
        setR(res);
        document.title = `${res.nombre} · aula.buzz`;
      },
      (e: Error) => setError(e.message),
    );
  }, []);

  if (error) return <p class="notice notice--error" role="alert">{error}</p>;
  if (!r) return <p class="muted">Cargando…</p>;

  const req = r.requisitos;
  // Las instrucciones las escriben administradores desde el panel.
  const instrucciones = r.instrucciones ? (marked.parse(r.instrucciones, { async: false }) as string) : null;
  return (
    <div class="layout">
      <article>
        <div class="resource__meta">
          <span class="badge">{TIPO_LABEL[r.tipo] ?? r.tipo}</span>
          <span class="muted">{r.asignatura}</span>
        </div>
        <h1>{r.nombre}</h1>
        <p>{r.descripcion}</p>
        <div class="card"><DownloadButton resource={toClient(r)} directUrl={r.directUrl} /></div>

        <h2>Ficha</h2>
        <dl class="facts">
          <dt>Archivo</dt><dd><code>{r.archivo.nombre}</code> · {formatBytes(r.archivo.tamano)}</dd>
          {r.so && <><dt>Sistema operativo</dt><dd>{r.so}</dd></>}
          {r.hipervisor && <><dt>Hipervisor</dt><dd>{r.hipervisor}</dd></>}
          {req?.ram_gb && <><dt>RAM</dt><dd>{req.ram_gb} GB</dd></>}
          {req?.cpus && <><dt>CPUs</dt><dd>{req.cpus}</dd></>}
          {req?.disco_gb && <><dt>Disco</dt><dd>{req.disco_gb} GB</dd></>}
          <dt>Actualizado</dt><dd>{new Date(r.actualizado).toLocaleDateString("es-ES", { dateStyle: "long" })}</dd>
          <dt>SHA-256</dt><dd><code class="hash">{r.archivo.sha256}</code></dd>
        </dl>

        {r.credenciales.length > 0 && (
          <>
            <h2>Credenciales por defecto</h2>
            <ul>
              {r.credenciales.map((c) => (
                <li>
                  Usuario <code>{c.usuario}</code> · contraseña <code>{c.password}</code>
                  {c.nota && <span class="muted"> — {c.nota}</span>}
                </li>
              ))}
            </ul>
          </>
        )}
        {instrucciones && (
          <>
            <h2>Instrucciones</h2>
            <div class="prose" dangerouslySetInnerHTML={{ __html: instrucciones }} />
          </>
        )}
      </article>
      <Dock />
    </div>
  );
}
