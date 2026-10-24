import { useState } from "preact/hooks";
import { formatBytes, usbSizeWarning } from "../../lib/format.ts";
import { enqueue, useStore, type ClientResource } from "../../lib/store.ts";
import { supportsDirectUsb } from "../../lib/usb.ts";

interface Props {
  resource: ClientResource;
  /** Si el recurso es de una sola parte con GitHub, hay descarga directa para cualquier navegador. */
  directUrl?: string;
}

export default function DownloadButton({ resource, directUrl }: Props) {
  const s = useStore();
  const [message, setMessage] = useState<string | null>(null);
  const warning = usbSizeWarning(resource.archivo.tamano);
  const job = s.jobs.find((j) => j.resource.id === resource.id && ["queued", "running", "verifying"].includes(j.status));
  const supported = typeof window === "undefined" || supportsDirectUsb();

  if (!supported) {
    return directUrl ? (
      <a class="btn btn--primary" href={directUrl} download={resource.archivo.nombre}>
        Descargar · {formatBytes(resource.archivo.tamano)}
      </a>
    ) : (
      <span class="muted">Usa Chrome o Edge para descargar</span>
    );
  }

  return (
    <div class="dl">
      <button
        class="btn btn--primary"
        disabled={Boolean(job)}
        onClick={async () => setMessage(await enqueue(resource))}
      >
        {job ? "En curso…" : `Guardar en el USB · ${formatBytes(resource.archivo.tamano)}`}
      </button>
      {warning && <div class="notice notice--warn">{warning}</div>}
      {message && <div class="notice notice--error" role="alert">{message}</div>}
    </div>
  );
}
