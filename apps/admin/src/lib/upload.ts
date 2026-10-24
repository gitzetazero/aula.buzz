// Subida de un archivo grande desde el navegador: se trocea en partes de 1,9 GiB
// (límite de GitHub), se calcula el SHA-256 de cada parte y del total, y cada
// parte se sube directamente a los mirrors elegidos.
import { createSHA256 } from "hash-wasm";
import { api, type Part } from "./api.ts";

export const PART_SIZE = Math.floor(1.9 * 1024 ** 3);

export function partName(fileName: string, index: number, count: number): string {
  return count === 1 ? fileName : `${fileName}.part${String(index + 1).padStart(3, "0")}`;
}

export interface UploadOptions {
  file: File;
  id: string;
  nombre: string;
  github: boolean;
  drive: boolean;
  partSize?: number;
  onStatus: (text: string, fraction: number) => void;
  signal?: AbortSignal;
}

export interface UploadResult {
  archivo: { nombre: string; tamano: number; sha256: string };
  partes: Part[];
}

async function hashBlobs(blob: Blob, total: { update(d: Uint8Array): void }, onBytes: (n: number) => void): Promise<string> {
  const part = await createSHA256();
  part.init();
  const reader = blob.stream().getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    part.update(value);
    total.update(value);
    onBytes(value.length);
  }
  return part.digest("hex");
}

/** PUT/POST de un Blob con progreso (fetch no informa del progreso de subida). */
function send(method: string, url: string, blob: Blob, headers: Record<string, string>, onProgress: (loaded: number) => void, signal?: AbortSignal) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => resolve({ status: xhr.status, body: xhr.responseText });
    xhr.onerror = () => reject(new Error("Fallo de red durante la subida"));
    signal?.addEventListener("abort", () => {
      xhr.abort();
      reject(new DOMException("Cancelado", "AbortError"));
    });
    xhr.send(blob);
  });
}

export async function uploadResource(o: UploadOptions): Promise<UploadResult> {
  const size = o.file.size;
  if (size === 0) throw new Error("El archivo está vacío");
  if (!o.github && !o.drive) throw new Error("Elige al menos un mirror");
  const partSize = o.partSize ?? PART_SIZE;
  const count = Math.max(1, Math.ceil(size / partSize));

  const gh = o.github ? await api<{ repo: string; releaseId: number; token: string }>("upload/github", { method: "POST", body: { id: o.id, nombre: o.nombre } }) : null;

  const total = await createSHA256();
  total.init();
  const partes: Part[] = [];
  let done = 0;
  const steps = count * (1 + Number(o.github) + Number(o.drive));
  let step = 0;
  const report = (text: string) => o.onStatus(text, step / steps);

  for (let i = 0; i < count; i++) {
    const blob = o.file.slice(i * partSize, Math.min(size, (i + 1) * partSize));
    const name = partName(o.file.name, i, count);
    report(`Parte ${i + 1}/${count}: calculando SHA-256…`);
    const sha256 = await hashBlobs(blob, total, (n) => (done += n));
    step++;
    const part: Part = { tamano: blob.size, sha256 };

    if (gh) {
      report(`Parte ${i + 1}/${count}: subiendo a GitHub…`);
      const res = await send(
        "POST",
        `https://uploads.github.com/repos/${gh.repo}/releases/${gh.releaseId}/assets?name=${encodeURIComponent(name)}`,
        blob,
        { Authorization: `Bearer ${gh.token}`, "Content-Type": "application/octet-stream", Accept: "application/vnd.github+json" },
        (loaded) => o.onStatus(`Parte ${i + 1}/${count}: GitHub ${Math.round((loaded / blob.size) * 100)} %`, (step + loaded / blob.size) / steps),
        o.signal,
      );
      if (res.status !== 201) throw new Error(`GitHub rechazó la parte ${i + 1} (${res.status})`);
      part.github_asset_id = (JSON.parse(res.body) as { id: number }).id;
      step++;
    }

    if (o.drive) {
      report(`Parte ${i + 1}/${count}: subiendo a Drive…`);
      const { sessionUrl } = await api<{ sessionUrl: string }>("upload/drive", { method: "POST", body: { name, size: blob.size } });
      const res = await send(
        "PUT",
        sessionUrl,
        blob,
        { "Content-Range": `bytes 0-${blob.size - 1}/${blob.size}` },
        (loaded) => o.onStatus(`Parte ${i + 1}/${count}: Drive ${Math.round((loaded / blob.size) * 100)} %`, (step + loaded / blob.size) / steps),
        o.signal,
      );
      if (res.status !== 200 && res.status !== 201) throw new Error(`Drive rechazó la parte ${i + 1} (${res.status})`);
      part.drive_id = (JSON.parse(res.body) as { id: string }).id;
      step++;
    }
    partes.push(part);
  }

  o.onStatus("Subida completa", 1);
  return { archivo: { nombre: o.file.name, tamano: size, sha256: total.digest("hex") }, partes };
}
