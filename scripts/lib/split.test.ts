import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { upsertSql } from "./catalog-sql.ts";
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

describe("upsertSql", () => {
  const H = "b".repeat(64);
  const entry = (extra = {}) => ({
    id: "demo", nombre: "Demo", descripcion: "x", asignatura: "SO", tipo: "vm", actualizado: "2026-10-01",
    archivo: { nombre: "demo.ova", tamano: 5, sha256: H },
    partes: [{ tamano: 5, sha256: H, drive_id: "abc" }],
    ...extra,
  });

  it("genera un upsert por id con la fecha en formato ISO", () => {
    const sql = upsertSql(entry());
    expect(sql).toContain("INSERT INTO resources (id, data, updated)");
    expect(sql).toContain("ON CONFLICT(id) DO UPDATE");
    expect(sql).toContain("'2026-10-01'");
  });

  it("escapa las comillas simples", () => {
    expect(upsertSql(entry({ nombre: "O'Brien" }))).toContain("O''Brien");
  });

  it("rechaza recursos inválidos", () => {
    expect(() => upsertSql(entry({ id: "No Válido" }))).toThrow();
  });
});
