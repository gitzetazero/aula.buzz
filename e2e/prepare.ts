// Construye la app con el catálogo de prueba.
import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { catalogYaml } from "./fixture.ts";

const dir = mkdtempSync(join(tmpdir(), "aula-e2e-"));
const catalog = join(dir, "resources.yaml");
writeFileSync(catalog, catalogYaml);
execSync("pnpm --filter @aula/recursos build", { stdio: "inherit", env: { ...process.env, AULA_CATALOG: catalog } });
