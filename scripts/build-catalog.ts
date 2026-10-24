// Valida el catálogo y genera apps/recursos/src/generated/catalog.json, que
// usan las Pages Functions (no pueden leer el sistema de archivos) para saber
// qué partes existen y en qué mirrors. Solo contiene identificadores.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCatalog, loadMirrors } from "../apps/recursos/src/lib/catalog.ts";

const out = resolve(dirname(fileURLToPath(import.meta.url)), "../apps/recursos/src/generated/catalog.json");
const recursos = loadCatalog().map((r) => ({
  id: r.id,
  partes: r.partes.map((p) => ({ tamano: p.tamano, github_asset_id: p.github_asset_id, drive_id: p.drive_id })),
}));

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ mirrors: loadMirrors(), recursos }, null, 1));
console.log(`catálogo válido: ${recursos.length} recurso(s) → ${out}`);
