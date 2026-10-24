import { createHash } from "node:crypto";

// Datos de prueba deterministas: 3 partes de tamaño distinto.
export const PART_SIZES = [300_000, 300_000, 123_457];

export const parts: Buffer[] = PART_SIZES.map((n, i) =>
  Buffer.from(Uint8Array.from({ length: n }, (_, j) => (i * 53 + j * 11 + (j >> 8)) % 256)),
);
export const whole = Buffer.concat(parts);
export const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

export const FILE_NAME = "demo-vm.ova";

export const catalogYaml = `
recursos:
  - id: demo-vm
    nombre: VM de prueba
    descripcion: Recurso sintético para los tests end-to-end.
    asignatura: Sistemas
    tipo: vm
    so: Debian
    actualizado: 2026-10-01
    archivo: { nombre: ${FILE_NAME}, tamano: ${whole.length}, sha256: ${sha(whole)} }
    partes:
${parts.map((p, i) => `      - { tamano: ${p.length}, sha256: ${sha(p)}, github_asset_id: ${100 + i}, drive_id: d${i} }`).join("\n")}
`;
