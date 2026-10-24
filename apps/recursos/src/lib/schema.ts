import { z } from "zod";

const sha256 = z.string().regex(/^[a-f0-9]{64}$/i, "SHA-256 en hexadecimal (64 caracteres)");

export const PART_SIZE = Math.floor(1.9 * 1024 ** 3); // por debajo del límite de 2 GiB de GitHub

export const partSchema = z
  .object({
    tamano: z.number().int().positive(),
    sha256,
    github_asset_id: z.number().int().positive().optional(),
    drive_id: z.string().min(1).optional(),
  })
  .refine((p) => p.github_asset_id !== undefined || p.drive_id !== undefined, {
    message: "Cada parte debe estar en al menos un mirror (github_asset_id o drive_id)",
  });

export const resourceSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "id en minúsculas con guiones"),
    nombre: z.string().min(1),
    descripcion: z.string().min(1),
    asignatura: z.string().min(1),
    tipo: z.enum(["vm", "iso", "archivo", "comprimido"]),
    so: z.string().optional(),
    tags: z.array(z.string()).default([]),
    actualizado: z.coerce.date(),
    hipervisor: z.string().optional(),
    requisitos: z
      .object({
        ram_gb: z.number().positive().optional(),
        disco_gb: z.number().positive().optional(),
        cpus: z.number().int().positive().optional(),
      })
      .optional(),
    credenciales: z
      .array(z.object({ usuario: z.string(), password: z.string(), nota: z.string().optional() }))
      .default([]),
    instrucciones: z.string().optional(),
    archivo: z.object({ nombre: z.string().min(1), tamano: z.number().int().positive(), sha256 }),
    partes: z.array(partSchema).min(1),
  })
  .superRefine((r, ctx) => {
    const total = r.partes.reduce((sum, p) => sum + p.tamano, 0);
    if (total !== r.archivo.tamano) {
      ctx.addIssue({
        code: "custom",
        path: ["partes"],
        message: `Las partes suman ${total} bytes pero archivo.tamano es ${r.archivo.tamano}`,
      });
    }
    if (/[\\/:*?"<>|]/.test(r.archivo.nombre)) {
      ctx.addIssue({ code: "custom", path: ["archivo", "nombre"], message: "Nombre de archivo no válido" });
    }
  });

export const catalogSchema = z
  .object({ recursos: z.array(resourceSchema) })
  .superRefine((c, ctx) => {
    const seen = new Set<string>();
    c.recursos.forEach((r, i) => {
      if (seen.has(r.id)) ctx.addIssue({ code: "custom", path: ["recursos", i, "id"], message: `id duplicado: ${r.id}` });
      seen.add(r.id);
    });
  });

export type Resource = z.infer<typeof resourceSchema>;
export type Part = z.infer<typeof partSchema>;

export const TIPO_LABEL: Record<Resource["tipo"], string> = {
  vm: "Máquina virtual",
  iso: "ISO",
  archivo: "Archivo",
  comprimido: "Comprimido",
};
