// Lee y valida catalog/resources.yaml en build. Un catálogo inválido rompe el build.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { catalogSchema, type Resource } from "./schema.ts";

// AULA_CATALOG permite usar otro archivo (los tests e2e usan un catálogo de prueba).
const CATALOG_PATH = process.env.AULA_CATALOG ?? fileURLToPath(new URL("../../catalog/resources.yaml", import.meta.url));

export function parseCatalog(text: string): Resource[] {
  const result = catalogSchema.safeParse(parse(text));
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`catalog/resources.yaml no es válido:\n${issues}`);
  }
  return result.data.recursos;
}

export function loadCatalog(): Resource[] {
  return parseCatalog(readFileSync(CATALOG_PATH, "utf8")).sort((a, b) => b.actualizado.getTime() - a.actualizado.getTime());
}

const MIRRORS_PATH = fileURLToPath(new URL("../../config/mirrors.yaml", import.meta.url));
export const KNOWN_MIRRORS = ["github", "drive"] as const;

export function parseMirrors(text: string): string[] {
  const doc = parse(text) as { mirrors?: { id: string; activo?: boolean }[] };
  const ids = (doc.mirrors ?? []).filter((m) => m.activo !== false).map((m) => m.id);
  const unknown = ids.filter((id) => !(KNOWN_MIRRORS as readonly string[]).includes(id));
  if (unknown.length) throw new Error(`config/mirrors.yaml: mirror desconocido: ${unknown.join(", ")}`);
  if (!ids.length) throw new Error("config/mirrors.yaml: no hay ningún mirror activo");
  return ids;
}

export function loadMirrors(): string[] {
  return parseMirrors(readFileSync(MIRRORS_PATH, "utf8"));
}
