import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { downloadFile, DownloadAbortedError, type PartSpec, type Sink, type Source } from "./download.ts";

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

function makeFile(sizes: number[]) {
  const parts: Uint8Array[] = sizes.map((n, i) => Uint8Array.from({ length: n }, (_, j) => (i * 31 + j * 7) % 256));
  const specs: PartSpec[] = parts.map((p) => ({ size: p.length, sha256: sha(p) }));
  return { parts, specs, whole: Buffer.concat(parts) };
}

function memorySink(size: number) {
  const buffer = new Uint8Array(size);
  const sink: Sink = { write: async (offset, chunk) => void buffer.set(chunk, offset) };
  return { buffer, sink };
}

type Behaviour = (ctx: { part: number; range: number; call: number }) => Response | Promise<Response> | undefined;

/** fetch simulado: la URL es `mirror://<mirror>/<parte>`. */
function fakeFetch(data: Uint8Array[], behaviour: Record<string, Behaviour> = {}) {
  const calls: string[] = [];
  const fn = (async (url: string, init?: RequestInit) => {
    const [, , mirror, part] = url.split("/") as [string, string, string, string];
    const range = Number(/bytes=(\d+)-/.exec((init?.headers as Record<string, string>).Range)![1]);
    calls.push(`${mirror}:${part}@${range}`);
    const custom = behaviour[mirror]?.({ part: Number(part), range, call: calls.length });
    if (custom) return custom;
    const body = data[Number(part)]!.slice(range);
    return new Response(body, { status: range > 0 ? 206 : 200 });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const sources = (...mirrors: string[]) => async (part: number): Promise<Source[]> =>
  mirrors.map((m) => ({ mirror: m, url: `mirror://${m}/${part}` }));

/** Respuesta que envía `bytes` y luego falla. */
const cutAfter = (data: Uint8Array, bytes: number, range: number) => {
  let sent = false;
  return new Response(
    new ReadableStream({
      pull(c) {
        if (!sent) {
          sent = true;
          c.enqueue(data.slice(range, range + bytes));
        } else {
          c.error(new Error("reset"));
        }
      },
    }),
    { status: range > 0 ? 206 : 200 },
  );
};

describe("downloadFile", () => {
  it("une las partes y reporta progreso", async () => {
    const f = makeFile([1000, 1000, 500]);
    const { buffer, sink } = memorySink(2500);
    const { fn } = fakeFetch(f.parts);
    const progress: number[] = [];
    await downloadFile({
      parts: f.specs, getSources: sources("github"), sink, fetchFn: fn,
      onProgress: (p) => progress.push(p.bytes),
    });
    expect(Buffer.from(buffer).equals(f.whole)).toBe(true);
    expect(progress.at(-1)).toBe(2500);
    expect(progress).toEqual([...progress].sort((a, b) => a - b));
  });

  it("cambia de mirror a mitad de una parte y continúa desde el mismo byte", async () => {
    const f = makeFile([1000, 1000]);
    const { buffer, sink } = memorySink(2000);
    const { fn, calls } = fakeFetch(f.parts, {
      github: ({ part, range }) => (part === 1 ? cutAfter(f.parts[1]!, 300, range) : undefined),
    });
    const switches: string[] = [];
    await downloadFile({
      parts: f.specs, getSources: sources("github", "drive"), sink, fetchFn: fn,
      onMirrorSwitch: (s) => switches.push(`${s.from}:${s.part}`),
    });
    expect(Buffer.from(buffer).equals(f.whole)).toBe(true);
    expect(calls).toContain("drive:1@300");
    expect(switches).toEqual(["github:1"]);
  });

  it("pasa al siguiente mirror ante 429 y 403", async () => {
    const f = makeFile([400]);
    const { buffer, sink } = memorySink(400);
    const { fn } = fakeFetch(f.parts, {
      github: () => new Response("", { status: 429 }),
      drive: () => new Response("", { status: 403 }),
    });
    await downloadFile({ parts: f.specs, getSources: sources("github", "drive", "tercero"), sink, fetchFn: fn });
    expect(Buffer.from(buffer).equals(f.whole)).toBe(true);
  });

  it("descarta un mirror con datos corruptos y reinicia la parte con otro", async () => {
    const f = makeFile([600]);
    const { buffer, sink } = memorySink(600);
    const bad = new Uint8Array(600).fill(9);
    const { fn, calls } = fakeFetch(f.parts, { github: () => new Response(bad, { status: 200 }) });
    await downloadFile({ parts: f.specs, getSources: sources("github", "drive"), sink, fetchFn: fn });
    expect(Buffer.from(buffer).equals(f.whole)).toBe(true);
    expect(calls).toEqual(["github:0@0", "drive:0@0"]);
  });

  it("pide URLs nuevas cuando todas han caducado", async () => {
    const f = makeFile([300]);
    const { buffer, sink } = memorySink(300);
    const { fn } = fakeFetch(f.parts, {
      old: () => new Response("", { status: 403 }),
    });
    const refreshes: boolean[] = [];
    await downloadFile({
      parts: f.specs, sink, fetchFn: fn,
      getSources: async (part, refresh) => {
        refreshes.push(refresh);
        return [{ mirror: refresh ? "nuevo" : "old", url: `mirror://${refresh ? "nuevo" : "old"}/${part}` }];
      },
    });
    expect(Buffer.from(buffer).equals(f.whole)).toBe(true);
    expect(refreshes).toEqual([false, true]);
  });

  it("falla si ningún mirror funciona", async () => {
    const f = makeFile([100]);
    const { sink } = memorySink(100);
    const { fn } = fakeFetch(f.parts, { a: () => new Response("", { status: 500 }) });
    await expect(downloadFile({ parts: f.specs, getSources: sources("a"), sink, fetchFn: fn })).rejects.toThrow(/HTTP 500/);
  });

  it("abandona un mirror que se queda sin responder", async () => {
    const f = makeFile([200]);
    const { buffer, sink } = memorySink(200);
    const { fn } = fakeFetch(f.parts, {
      colgado: () => new Response(new ReadableStream({ start() {} }), { status: 200 }),
    });
    // El stream colgado nunca cierra: el fetch simulado debe respetar la señal.
    const hanging = (async (url: string, init?: RequestInit) => {
      if (url.includes("colgado")) {
        return new Response(
          new ReadableStream({
            start(c) {
              init?.signal?.addEventListener("abort", () => c.error(new Error("aborted")));
            },
          }),
        );
      }
      return fn(url, init);
    }) as unknown as typeof fetch;
    await downloadFile({ parts: f.specs, getSources: sources("colgado", "drive"), sink, fetchFn: hanging, stallMs: 50 });
    expect(Buffer.from(buffer).equals(f.whole)).toBe(true);
  });

  it("reanuda desde una parte intermedia", async () => {
    const f = makeFile([500, 500, 500]);
    const { buffer, sink } = memorySink(1500);
    buffer.set(f.parts[0]!, 0);
    const { fn, calls } = fakeFetch(f.parts);
    await downloadFile({ parts: f.specs, getSources: sources("github"), sink, fetchFn: fn, startPart: 1 });
    expect(Buffer.from(buffer).equals(f.whole)).toBe(true);
    expect(calls.every((c) => !c.startsWith("github:0"))).toBe(true);
  });

  it("se puede cancelar", async () => {
    const f = makeFile([100, 100]);
    const { sink } = memorySink(200);
    const { fn } = fakeFetch(f.parts);
    const controller = new AbortController();
    await expect(
      downloadFile({
        parts: f.specs, getSources: sources("github"), sink, fetchFn: fn, signal: controller.signal,
        onPartDone: () => controller.abort(),
      }),
    ).rejects.toBeInstanceOf(DownloadAbortedError);
  });
});
