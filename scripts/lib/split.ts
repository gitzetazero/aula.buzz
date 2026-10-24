import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { once } from "node:events";

export interface SplitPart {
  /** Nombre del archivo de la parte (en el mirror). */
  name: string;
  path: string;
  size: number;
  sha256: string;
}

export interface SplitResult {
  fileName: string;
  size: number;
  sha256: string;
  parts: SplitPart[];
}

/** Nombre de la parte: una sola → el nombre original (descargable tal cual); varias → `.part001`… */
export function partName(fileName: string, index: number, count: number): string {
  return count === 1 ? fileName : `${fileName}.part${String(index + 1).padStart(3, "0")}`;
}

/**
 * Corta el archivo byte a byte en partes de `partSize` y calcula el SHA-256 de
 * cada parte y del total en una sola lectura, sin cargarlo en memoria.
 * Concatenadas en orden, las partes reproducen el original exacto.
 */
export async function splitAndHash(file: string, outDir: string, partSize: number): Promise<SplitResult> {
  const { size } = await stat(file);
  const fileName = basename(file);
  const count = Math.max(1, Math.ceil(size / partSize));
  await mkdir(outDir, { recursive: true });

  const total = createHash("sha256");
  const parts: SplitPart[] = [];

  let index = -1;
  let hash = createHash("sha256");
  let out: ReturnType<typeof createWriteStream> | null = null;
  let written = 0;

  const closePart = async () => {
    if (!out) return;
    out.end();
    await once(out, "close");
    const name = partName(fileName, index, count);
    parts.push({ name, path: join(outDir, name), size: written, sha256: hash.digest("hex") });
    out = null;
  };

  for await (const chunk of createReadStream(file, { highWaterMark: 4 * 1024 * 1024 }) as AsyncIterable<Buffer>) {
    total.update(chunk);
    let offset = 0;
    while (offset < chunk.length) {
      if (!out || written === partSize) {
        await closePart();
        index++;
        hash = createHash("sha256");
        written = 0;
        out = createWriteStream(join(outDir, partName(fileName, index, count)));
      }
      const slice = chunk.subarray(offset, offset + Math.min(chunk.length - offset, partSize - written));
      if (!out.write(slice)) await once(out, "drain");
      hash.update(slice);
      written += slice.length;
      offset += slice.length;
    }
  }
  await closePart();
  return { fileName, size, sha256: total.digest("hex"), parts };
}
