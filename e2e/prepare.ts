// Construye la app de Recursos (el catálogo de prueba lo sirve e2e/server.ts).
import { execSync } from "node:child_process";

execSync("pnpm --filter @aula/recursos build", { stdio: "inherit" });
