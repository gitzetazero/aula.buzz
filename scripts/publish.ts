// Publica un recurso: trocea el archivo, calcula los SHA-256, lo sube a los
// mirrors (GitHub Releases en un repo privado y/o Google Drive vía rclone) y
// añade la entrada a apps/recursos/catalog/resources.yaml.
//
//   pnpm publish-resource ./kali.ova --id kali-2026-1 --nombre "Kali Linux 2026.1" \
//     --descripcion "VM del módulo de seguridad" --asignatura "Seguridad" --tipo vm \
//     --github-repo gitzetazero/aulareleases --rclone-remote gdrive:aula-recursos
//
// Requisitos: `gh` autenticado (GitHub) y `rclone` con un remote de Drive.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { parseCatalog } from "../apps/recursos/src/lib/catalog.ts";
import { PART_SIZE } from "../apps/recursos/src/lib/schema.ts";
import { upsertResource } from "./lib/catalog-edit.ts";
import { splitAndHash } from "./lib/split.ts";

const CATALOG = resolve(dirname(fileURLToPath(import.meta.url)), "../apps/recursos/catalog/resources.yaml");

const HELP = `Uso: pnpm publish-resource <archivo> --id <id> --nombre <t> --descripcion <t> --asignatura <t> --tipo <vm|iso|archivo|comprimido> [opciones]

Mirrors (al menos uno):
  --github-repo <usuario/repo>   repo privado de releases (o GH_ASSETS_REPO)
  --rclone-remote <remote:ruta>  carpeta de Drive configurada en rclone, p. ej. gdrive:aula-recursos
  --skip-github | --skip-drive   no usar ese mirror aunque esté configurado

Metadatos opcionales: --so --tags a,b --hipervisor --ram <GB> --cpus <n> --disco <GB> --instrucciones <markdown>
Otros: --part-size <bytes> (por defecto 1,9 GiB)  --dry-run (trocea y calcula hashes, no sube nada)`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    id: { type: "string" }, nombre: { type: "string" }, descripcion: { type: "string" },
    asignatura: { type: "string" }, tipo: { type: "string" }, so: { type: "string" },
    tags: { type: "string" }, hipervisor: { type: "string" }, instrucciones: { type: "string" },
    ram: { type: "string" }, cpus: { type: "string" }, disco: { type: "string" },
    "github-repo": { type: "string" }, "rclone-remote": { type: "string" },
    "skip-github": { type: "boolean" }, "skip-drive": { type: "boolean" },
    "part-size": { type: "string" }, "dry-run": { type: "boolean" }, help: { type: "boolean", short: "h" },
  },
});

function fail(message: string): never {
  console.error(`✖ ${message}\n\n${HELP}`);
  process.exit(1);
}

const run = (cmd: string, args: string[]) => execFileSync(cmd, args, { stdio: ["ignore", "pipe", "inherit"], encoding: "utf8" });
const runVisible = (cmd: string, args: string[]) => execFileSync(cmd, args, { stdio: "inherit" });

async function main() {
  if (values.help) return console.log(HELP);
  const [file] = positionals;
  if (!file) fail("Falta el archivo a publicar.");
  for (const key of ["id", "nombre", "descripcion", "asignatura", "tipo"] as const) {
    if (!values[key]) fail(`Falta --${key}.`);
  }

  const githubRepo = values["skip-github"] ? undefined : (values["github-repo"] ?? process.env.GH_ASSETS_REPO);
  const rcloneRemote = values["skip-drive"] ? undefined : values["rclone-remote"];
  if (!values["dry-run"] && !githubRepo && !rcloneRemote) fail("Configura al menos un mirror (--github-repo o --rclone-remote).");

  const partSize = values["part-size"] ? Number(values["part-size"]) : PART_SIZE;
  const id = values.id!;
  const source = resolve(file);
  const outDir = `${source}.parts`;

  console.log(`→ Troceando y calculando SHA-256 (${outDir})…`);
  const split = await splitAndHash(source, outDir, partSize);
  console.log(`  ${split.parts.length} parte(s), total ${split.size} bytes, sha256 ${split.sha256}`);
  if (values["dry-run"]) {
    for (const p of split.parts) console.log(`  ${p.name}  ${p.size}  ${p.sha256}`);
    return console.log("✔ Dry run: no se ha subido nada ni modificado el catálogo.");
  }

  const githubIds = new Map<string, number>();
  if (githubRepo) {
    console.log(`→ Subiendo a GitHub (${githubRepo}, release ${id})…`);
    try {
      run("gh", ["release", "view", id, "--repo", githubRepo]);
    } catch {
      run("gh", ["release", "create", id, "--repo", githubRepo, "--title", values.nombre!, "--notes", `Recurso ${id}`]);
    }
    runVisible("gh", ["release", "upload", id, ...split.parts.map((p) => p.path), "--repo", githubRepo, "--clobber"]);
    const assets = JSON.parse(run("gh", ["api", `repos/${githubRepo}/releases/tags/${id}`, "--jq", ".assets"])) as { name: string; id: number }[];
    for (const a of assets) githubIds.set(a.name, a.id);
  }

  const driveIds = new Map<string, string>();
  if (rcloneRemote) {
    const target = `${rcloneRemote.replace(/\/$/, "")}/${id}`;
    console.log(`→ Subiendo a Drive (${target})…`);
    runVisible("rclone", ["copy", outDir, target, "--progress", "--drive-chunk-size", "128M"]);
    const listing = JSON.parse(run("rclone", ["lsjson", target, "--no-modtime"])) as { Name: string; ID: string }[];
    for (const f of listing) driveIds.set(f.Name, f.ID);
  }

  const partes = split.parts.map((p) => {
    const github_asset_id = githubIds.get(p.name);
    const drive_id = driveIds.get(p.name);
    if (githubRepo && github_asset_id === undefined) fail(`GitHub no devolvió el asset ${p.name}.`);
    if (rcloneRemote && drive_id === undefined) fail(`Drive no devolvió el archivo ${p.name}.`);
    return { tamano: p.size, sha256: p.sha256, ...(github_asset_id && { github_asset_id }), ...(drive_id && { drive_id }) };
  });

  const num = (v: string | undefined) => (v === undefined ? undefined : Number(v));
  const requisitos = Object.fromEntries(
    Object.entries({ ram_gb: num(values.ram), disco_gb: num(values.disco), cpus: num(values.cpus) }).filter(([, v]) => v !== undefined),
  );
  const entry = {
    id,
    nombre: values.nombre!,
    descripcion: values.descripcion!,
    asignatura: values.asignatura!,
    tipo: values.tipo!,
    ...(values.so && { so: values.so }),
    ...(values.tags && { tags: values.tags.split(",").map((t) => t.trim()).filter(Boolean) }),
    actualizado: new Date().toISOString().slice(0, 10),
    ...(values.hipervisor && { hipervisor: values.hipervisor }),
    ...(Object.keys(requisitos).length && { requisitos }),
    ...(values.instrucciones && { instrucciones: values.instrucciones }),
    archivo: { nombre: split.fileName, tamano: split.size, sha256: split.sha256 },
    partes,
  };

  const updated = upsertResource(readFileSync(CATALOG, "utf8"), entry);
  parseCatalog(updated); // lanza si el resultado no es válido
  writeFileSync(CATALOG, updated);
  console.log(`✔ ${id} añadido a ${CATALOG}\n  Revisa el cambio, haz commit y push: Cloudflare Pages lo despliega solo.`);
  console.log(`  Puedes borrar ${outDir} cuando quieras.`);
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
