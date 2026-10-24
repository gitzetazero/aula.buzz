import { createSHA256 } from "hash-wasm";

/** SHA-256 de un archivo en streaming, sin cargarlo en memoria. */
export async function hashFile(
  file: Blob,
  onProgress?: (bytes: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  const hasher = await createSHA256();
  hasher.init();
  const reader = file.stream().getReader();
  let bytes = 0;
  for (;;) {
    if (signal?.aborted) {
      await reader.cancel();
      throw new DOMException("Cancelado", "AbortError");
    }
    const { done, value } = await reader.read();
    if (done) break;
    hasher.update(value);
    bytes += value.length;
    onProgress?.(bytes);
  }
  return hasher.digest("hex");
}
