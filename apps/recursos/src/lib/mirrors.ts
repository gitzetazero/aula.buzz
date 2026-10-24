import type { Source } from "./download.ts";

/** Pide al servidor las fuentes (URL + cabeceras) de una parte. */
export async function fetchSources(resourceId: string, part: number, _refresh = false): Promise<Source[]> {
  const res = await fetch("/api/recursos/ticket", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ id: resourceId, part }),
  });
  if (res.status === 401) throw new Error("Tu sesión ha caducado. Recarga la página para volver a entrar.");
  if (!res.ok) {
    const message = ((await res.json().catch(() => null)) as { error?: string } | null)?.error;
    throw new Error(message ?? `El servidor respondió ${res.status}`);
  }
  return ((await res.json()) as { sources: Source[] }).sources;
}
