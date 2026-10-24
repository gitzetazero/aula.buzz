export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${units[i]}`.replace(".", ",");
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  if (seconds < 60) return `${Math.ceil(seconds)} s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

export const FAT32_LIMIT = 4 * 1024 ** 3;

/** Aviso a mostrar antes de descargar a un USB; `null` si no hace falta. */
export function usbSizeWarning(size: number): string | null {
  if (size < FAT32_LIMIT) return null;
  return "Este archivo pesa más de 4 GB. Si tu USB está en FAT32 la escritura fallará: formatéalo en exFAT (o NTFS) antes de continuar.";
}

/** Traduce los errores de escritura/descarga a un mensaje que el usuario pueda entender. */
export function describeError(error: unknown, fileSize: number): string {
  const name = error instanceof DOMException || error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error);
  if (name === "QuotaExceededError") return "El USB no tiene espacio suficiente.";
  if (name === "NotAllowedError" || name === "SecurityError") return "No hay permiso para escribir en el USB. Vuelve a elegirlo.";
  if (name === "NotFoundError" || name === "InvalidStateError") return "No se encuentra el USB. ¿Sigue conectado?";
  if (name === "NoModificationAllowedError" || name === "TypeMismatchError") {
    return "No se puede escribir ese archivo en el USB (¿protegido contra escritura o con el archivo en uso?).";
  }
  if (fileSize >= FAT32_LIMIT && /write|disk|file|too large/i.test(message)) {
    return "No se pudo escribir en el USB. Con archivos de más de 4 GB suele ser FAT32: formatéalo en exFAT.";
  }
  return message;
}

export function matchesQuery(haystack: string, query: string): boolean {
  const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const terms = norm(query).split(/\s+/).filter(Boolean);
  const text = norm(haystack);
  return terms.every((t) => text.includes(t));
}
