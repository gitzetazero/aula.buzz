// Motor de descarga: une las partes de un recurso en un único archivo.
//
// - Cada parte se pide con `Range` y se verifica con su SHA-256.
// - Si un mirror falla (error HTTP, cuota, corte o bloqueo), se continúa con
//   el siguiente desde el mismo byte, sin volver a empezar la parte.
// - No depende del navegador: la salida es un `Sink` y `fetch` es inyectable.

import { createSHA256 } from "hash-wasm";

export interface Source {
  mirror: string;
  url: string;
  headers?: Record<string, string>;
}

export interface PartSpec {
  size: number;
  sha256: string;
}

export interface Sink {
  /** Escribe `chunk` en la posición absoluta `offset` del archivo final. */
  write(offset: number, chunk: Uint8Array): Promise<void>;
}

export interface Progress {
  bytes: number;
  total: number;
  part: number;
  mirror: string;
}

export interface DownloadOptions {
  parts: PartSpec[];
  /** Fuentes ordenadas por prioridad. `refresh` pide URLs/tokens nuevos. */
  getSources(partIndex: number, refresh: boolean): Promise<Source[]>;
  sink: Sink;
  /** Primera parte a descargar (las anteriores ya están verificadas). */
  startPart?: number;
  onProgress?(progress: Progress): void;
  onPartDone?(partIndex: number): void | Promise<void>;
  onMirrorSwitch?(info: { part: number; from: string; reason: string }): void;
  signal?: AbortSignal;
  fetchFn?: typeof fetch;
  /** Milisegundos sin recibir bytes antes de abandonar un mirror. */
  stallMs?: number;
}

export class HashMismatchError extends Error {
  constructor(part: number, mirror: string) {
    super(`La parte ${part + 1} no coincide con su SHA-256 (mirror ${mirror})`);
    this.name = "HashMismatchError";
  }
}

export class DownloadAbortedError extends Error {
  constructor() {
    super("Descarga cancelada");
    this.name = "DownloadAbortedError";
  }
}

const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

export function partOffset(parts: PartSpec[], index: number): number {
  let offset = 0;
  for (let i = 0; i < index; i++) offset += parts[i]!.size;
  return offset;
}

export async function downloadFile(options: DownloadOptions): Promise<void> {
  const { parts, startPart = 0, signal } = options;
  const total = parts.reduce((sum, p) => sum + p.size, 0);
  let done = partOffset(parts, startPart);

  for (let i = startPart; i < parts.length; i++) {
    if (signal?.aborted) throw new DownloadAbortedError();
    const base = done;
    await downloadPart(i, partOffset(parts, i), (received, mirror) => {
      options.onProgress?.({ bytes: base + received, total, part: i, mirror });
    }, options);
    done += parts[i]!.size;
    await options.onPartDone?.(i);
  }
}

async function downloadPart(
  index: number,
  fileOffset: number,
  report: (received: number, mirror: string) => void,
  options: DownloadOptions,
): Promise<void> {
  const part = options.parts[index]!;
  const state = { received: 0, hasher: await createSHA256() };
  state.hasher.init();

  let refreshed = false;
  let lastError: unknown = new Error("No hay fuentes disponibles");

  for (;;) {
    const sources = await options.getSources(index, refreshed);
    for (const source of sources) {
      try {
        await attempt(source, index, part, fileOffset, state, report, options);
        return;
      } catch (error) {
        if (options.signal?.aborted) throw new DownloadAbortedError();
        lastError = error;
        if (error instanceof HashMismatchError) {
          state.received = 0;
          state.hasher.init();
        }
        options.onMirrorSwitch?.({
          part: index,
          from: source.mirror,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
    if (refreshed) throw lastError;
    // Puede que las URLs/tokens hayan caducado: una segunda vuelta con datos nuevos.
    refreshed = true;
  }
}

async function attempt(
  source: Source,
  index: number,
  part: PartSpec,
  fileOffset: number,
  state: { received: number; hasher: Awaited<ReturnType<typeof createSHA256>> },
  report: (received: number, mirror: string) => void,
  options: DownloadOptions,
): Promise<void> {
  const fetchFn = options.fetchFn ?? fetch;
  const stallMs = options.stallMs ?? 20_000;
  const controller = new AbortController();
  const onUserAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onUserAbort);

  let stalled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      stalled = true;
      controller.abort();
    }, stallMs);
  };

  try {
    arm();
    const response = await fetchFn(source.url, {
      headers: { ...source.headers, Range: `bytes=${state.received}-${part.size - 1}` },
      signal: controller.signal,
      credentials: "same-origin",
    });
    if (state.received > 0 && response.status !== 206) {
      throw new Error(`${source.mirror}: no admite reanudar (HTTP ${response.status})`);
    }
    if (!response.ok || !response.body) {
      throw new Error(`${source.mirror}: HTTP ${response.status}`);
    }

    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      arm();
      if (state.received + value.length > part.size) {
        throw new Error(`${source.mirror}: el servidor envió más bytes de los esperados`);
      }
      await options.sink.write(fileOffset + state.received, value);
      state.hasher.update(value);
      state.received += value.length;
      report(state.received, source.mirror);
    }
  } catch (error) {
    if (stalled) throw new Error(`${source.mirror}: sin respuesta durante ${Math.round(stallMs / 1000)} s`);
    throw error;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onUserAbort);
  }

  if (state.received < part.size) {
    throw new Error(`${source.mirror}: conexión cortada (${state.received}/${part.size} bytes)`);
  }
  if (toHex(state.hasher.digest("binary")) !== part.sha256.toLowerCase()) {
    throw new HashMismatchError(index, source.mirror);
  }
}
