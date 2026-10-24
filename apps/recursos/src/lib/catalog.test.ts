import { describe, expect, it } from "vitest";
import { parseCatalog } from "./catalog.ts";

const H = "a".repeat(64);
const base = `
recursos:
  - id: demo
    nombre: Demo
    descripcion: Prueba
    asignatura: SO
    tipo: vm
    actualizado: 2026-10-01
    archivo: { nombre: demo.ova, tamano: 300, sha256: ${H} }
    partes:
      - { tamano: 100, sha256: ${H}, drive_id: x }
      - { tamano: 200, sha256: ${H}, github_asset_id: 5 }
`;

describe("parseCatalog", () => {
  it("acepta un catálogo válido", () => {
    const [r] = parseCatalog(base);
    expect(r?.id).toBe("demo");
    expect(r?.tags).toEqual([]);
  });

  it("acepta el catálogo vacío", () => {
    expect(parseCatalog("recursos: []")).toEqual([]);
  });

  it("rechaza partes que no suman el tamaño del archivo", () => {
    expect(() => parseCatalog(base.replace("tamano: 300", "tamano: 999"))).toThrow(/suman 300/);
  });

  it("exige al menos un mirror por parte", () => {
    expect(() => parseCatalog(base.replace(", drive_id: x", ""))).toThrow(/al menos un mirror/);
  });

  it("rechaza ids duplicados", () => {
    const dup = base + base.split("recursos:\n")[1];
    expect(() => parseCatalog(dup)).toThrow(/id duplicado/);
  });

  it("rechaza nombres de archivo con separadores de ruta", () => {
    expect(() => parseCatalog(base.replace("demo.ova", "../demo.ova"))).toThrow(/Nombre de archivo/);
  });
});
