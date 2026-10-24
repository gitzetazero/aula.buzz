// Junta las apps estáticas en un único `dist/` para el Worker:
//   portal  → dist/            (aula.buzz/)
//   recursos → dist/recursos   (aula.buzz/recursos/)
//   admin    → dist/admin      (aula.buzz/admin/)
// Cada app se compila con su `base` de Astro, por eso sus rutas ya encajan.
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, "dist");

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const parts: [string, string][] = [
  ["apps/portal/dist", "."],
  ["apps/recursos/dist", "recursos"],
  ["apps/admin/dist", "admin"],
];
for (const [from, to] of parts) {
  const src = resolve(root, from);
  if (!existsSync(src)) throw new Error(`Falta ${from}: ejecuta primero el build de cada app`);
  cpSync(src, resolve(out, to), { recursive: true });
}
console.log(`dist ensamblado en ${out}`);
