import { useEffect, useState } from "preact/hooks";
import { formatBytes, formatDuration } from "../../lib/format.ts";
import {
  addUsb, cancelJob, clearFinished, hasActiveJobs, init, refreshStatuses, removeUsb, selectUsb, setAlias, setVerify,
  useStore, type Job,
} from "../../lib/store.ts";
import { isWindows, supportsDirectUsb } from "../../lib/usb.ts";

const STATUS_TEXT: Record<Job["status"], string> = {
  queued: "En cola",
  running: "Descargando",
  verifying: "Verificando en el USB",
  done: "Listo en la raíz del USB",
  error: "Error",
  cancelled: "Cancelado",
};

function Guide() {
  const windows = isWindows();
  return (
    <details class="guide">
      <summary>¿Cómo elijo mi USB?</summary>
      <p>
        Por seguridad el navegador no puede ver tus unidades, así que se elige una vez. En la ventana que se abre,
        selecciona la <strong>raíz</strong> del USB y pulsa «Seleccionar carpeta» y «Permitir».
      </p>
      <ul>
        <li><strong>Windows:</strong> «Este equipo» → tu USB (por ejemplo <code>E:</code>).</li>
        <li><strong>macOS:</strong> barra lateral → tu USB, o <code>/Volumes</code>.</li>
        <li><strong>Linux:</strong> <code>/media/tu-usuario/NOMBRE</code> o <code>/run/media/…</code>.</li>
      </ul>
      {windows && <p class="muted">Windows no permite elegir a veces la raíz de una unidad; si te lo impide, usa una carpeta dentro del USB.</p>}
    </details>
  );
}

function JobRow({ job }: { job: Job }) {
  const total = job.resource.archivo.tamano;
  const pct = Math.min(100, Math.round((job.bytes / total) * 100));
  const active = job.status === "running" || job.status === "verifying";
  let eta = "";
  if (job.status === "running" && job.startedAt && job.bytes > 0) {
    const speed = job.bytes / ((Date.now() - job.startedAt) / 1000);
    eta = ` · ${formatBytes(speed)}/s · quedan ${formatDuration((total - job.bytes) / speed)}`;
  }
  return (
    <li class="job" data-status={job.status}>
      <div class="job__head">
        <strong>{job.resource.nombre}</strong>
        <span class="muted">{STATUS_TEXT[job.status]}</span>
        {(active || job.status === "queued") && (
          <button class="btn btn--small btn--ghost" onClick={() => cancelJob(job.id)}>Cancelar</button>
        )}
      </div>
      {active && (
        <>
          <progress max={100} value={pct} aria-label={`${job.resource.nombre}: ${pct}%`} />
          <div class="muted job__meta">
            {pct}% · {formatBytes(job.bytes)} de {formatBytes(total)}
            {job.mirror && job.status === "running" ? ` · vía ${job.mirror}` : ""}
            {eta}
          </div>
        </>
      )}
      {job.notice && <div class="notice notice--warn">{job.notice}</div>}
      {job.error && <div class="notice notice--error" role="alert">{job.error}</div>}
    </li>
  );
}

export default function Dock() {
  const s = useStore();
  const [supported, setSupported] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSupported(supportsDirectUsb());
    void init();
    const onFocus = () => void refreshStatuses();
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasActiveJobs()) e.preventDefault();
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, []);

  if (!supported) {
    return (
      <aside class="dock card" aria-label="Descargas">
        <h2>Tu navegador no puede escribir en el USB</h2>
        <p class="muted">
          Para guardar directamente en el USB usa <strong>Chrome</strong>, <strong>Edge</strong> u otro navegador basado
          en Chromium. Los recursos de una sola parte se pueden descargar con el botón normal.
        </p>
      </aside>
    );
  }

  const onAdd = async () => {
    setBusy(true);
    setError(null);
    try {
      await addUsb();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside class="dock card" aria-label="Descargas">
      <h2>Mi USB</h2>
      {s.usbs.length === 0 && <p class="muted">Conecta tu USB al ordenador y pulsa el botón para elegirlo.</p>}
      <ul class="usbs">
        {s.usbs.map((u) => {
          const status = s.statuses[u.id];
          return (
            <li>
              <label>
                <input type="radio" name="usb" checked={s.selectedUsbId === u.id} onChange={() => void selectUsb(u.id)} />
                <input
                  class="alias" type="text" value={u.alias} aria-label="Nombre del USB"
                  onChange={(e) => void setAlias(u.id, (e.target as HTMLInputElement).value)}
                />
              </label>
              <span class={`pill pill--${status ?? "unavailable"}`}>
                {status === "ready" ? "Conectado" : status === "needs-permission" ? "Falta permiso" : "No disponible"}
              </span>
              <button class="btn btn--small btn--ghost" onClick={() => void removeUsb(u.id)} aria-label={`Olvidar ${u.alias}`}>✕</button>
            </li>
          );
        })}
      </ul>
      <button class="btn btn--primary" onClick={onAdd} disabled={busy}>
        {s.usbs.length ? "Añadir otro USB" : "Conectar USB"}
      </button>
      {s.suspiciousRoot && (
        <div class="notice notice--warn">Esa carpeta no parece la raíz de una unidad. Los archivos se guardarán dentro de ella.</div>
      )}
      {error && <div class="notice notice--error" role="alert">{error}</div>}
      <Guide />
      <label class="verify">
        <input type="checkbox" checked={s.verify} onChange={(e) => setVerify((e.target as HTMLInputElement).checked)} />
        Verificar el archivo en el USB al terminar (recomendado)
      </label>

      {s.jobs.length > 0 && (
        <>
          <h3>Descargas</h3>
          <ul class="jobs">{s.jobs.map((j) => <JobRow key={j.id} job={j} />)}</ul>
          <button class="btn btn--small btn--ghost" onClick={clearFinished}>Limpiar terminadas</button>
        </>
      )}
    </aside>
  );
}
