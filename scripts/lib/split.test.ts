import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCatalog } from "../../apps/recursos/src/lib/catalog.ts";
import { upsertResource } from "./catalog-edit.ts";
import { partName, splitAndHash } from "./split.ts";

const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

describe("splitAndHash", () => {
  it("las partes concatenadas reproducen el original y los hashes cuadran", async () => {
    const dir = await mkdtemp(join(tmpdir(), "split-"));
    const data = randomBytes(10_000_019); // no múltiplo del tamaño de parte ni del buffer
    await writeFile(join(dir, "vm.ova"), data);

    const r = await splitAndHash(join(dir, "vm.ova"), join(dir, "out"), 4_000_000);
    expect(r.size).toBe(data.length);
    expect(r.sha256).toBe(sha(data));
    expect(r.parts.map((p) => p.size)).toEqual([4_000_000, 4_000_000, 2_000_019]);
    expect(r.parts.map((p) => p.name)).toEqual(["vm.ova.part001", "vm.ova.part002", "vm.ova.part003"]);

    const buffers = await Promise.all(r.parts.map((p) => readFile(p.path)));
    expect(Buffer.concat(buffers).equals(data)).toBe(true);
    r.parts.forEach((p, i) => expect(p.sha256).toBe(sha(buffers[i]!)));
  });

  it("un archivo pequeño es una sola parte con su nombre original", async () => {
    const dir = await mkdtemp(join(tmpdir(), "split-"));
    await writeFile(join(dir, "notas.pdf"), "hola");
    const r = await splitAndHash(join(dir, "notas.pdf"), join(dir, "out"), 1000);
    expect(r.parts).toHaveLength(1);
    expect(r.parts[0]!.name).toBe("notas.pdf");
  });

  it("un archivo de tamaño exacto múltiplo no deja una parte vacía", async () => {
    const dir = await mkdtemp(join(tmpdir(), "split-"));
    await writeFile(join(dir, "a.bin"), Buffer.alloc(2000, 7));
    const r = await splitAndHash(join(dir, "a.bin"), join(dir, "out"), 1000);
    expect(r.parts.map((p) => p.size)).toEqual([1000, 1000]);
  });

  it("partName", () => {
    expect(partName("a.iso", 0, 1)).toBe("a.iso");
    expect(partName("a.iso", 11, 12)).toBe("a.iso.part012");
  });
});

describe("upsertResource", () => {
  const H = "b".repeat(64);
  const entry = (extra = {}) => ({
    id: "demo", nombre: "Demo", descripcion: "x", asignatura: "SO", tipo: "vm", actualizado: "2026-10-01",
    archivo: { nombre: "demo.ova", tamano: 5, sha256: H },
    partes: [{ tamano: 5, sha256: H, drive_id: "abc" }],
    ...extra,
  });

  it("añade a un catálogo vacío conservando los comentarios y produce un catálogo válido", () => {
    const out = upsertResource("# cabecera\nrecursos: []\n", entry());
    expect(out).toContain("# cabecera");
    expect(parseCatalog(out).map((r) => r.id)).toEqual(["demo"]);
  });

  it("sustituye por id sin duplicar", () => {
    const first = upsertResource("recursos: []\n", entry());
    const second = upsertResource(first, entry({ nombre: "Demo v2" }));
    const list = parseCatalog(second);
    expect(list).toHaveLength(1);
    expect(list[0]!.nombre).toBe("Demo v2");
  });

  it("añade otro recurso al final", () => {
    const out = upsertResource(upsertResource("recursos: []\n", entry()), entry({ id: "otro" }));
    expect(parseCatalog(out).map((r) => r.id)).toEqual(["demo", "otro"]);
  });
});
