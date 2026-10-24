// Servidor de pruebas: sirve apps/recursos/dist bajo /recursos y simula /api/* y los mirrors.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { FILE_NAME, parts, sha, whole } from "./fixture.ts";

const DIST = fileURLToPath(new URL("../apps/recursos/dist", import.meta.url));
const PORT = Number(process.env.PORT ?? 4322);
const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };

/** Contadores que los tests consultan en /__stats. */
const stats = { github: [] as string[], drive: [] as string[], failGithubPart: 1, delayMs: 0 };

function sendBody(res: import("node:http").ServerResponse, req: import("node:http").IncomingMessage, data: Buffer, cut?: number) {
  const range = /bytes=(\d+)-/.exec(req.headers.range ?? "");
  const start = range ? Number(range[1]) : 0;
  const body = data.subarray(start);
  res.writeHead(range ? 206 : 200, {
    "Content-Type": "application/octet-stream",
    "Content-Length": body.length,
    "Accept-Ranges": "bytes",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization,range",
  });
  if (cut === undefined) return res.end(body);
  // Envía `cut` bytes y corta la conexión (simula un corte de red).
  res.write(body.subarray(0, cut));
  setTimeout(() => res.destroy(), 20);
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  try {
    if (url.pathname === "/api/me") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ email: "ana@clase.es" }));
    }
    if (url.pathname === "/__stats") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(stats));
    }
    if (url.pathname === "/__slow") {
      stats.delayMs = Number(url.searchParams.get("ms") ?? 0);
      res.writeHead(204);
      return res.end();
    }
    if (url.pathname === "/__reset") {
      stats.github.length = 0;
      stats.drive.length = 0;
      stats.delayMs = 0;
      res.writeHead(204);
      return res.end();
    }
    const resource = {
      id: "demo-vm", nombre: "VM de prueba", descripcion: "Recurso sintético para los tests end-to-end.", asignatura: "Sistemas",
      tipo: "vm", so: "Debian", tags: [], actualizado: "2026-10-01", credenciales: [],
      archivo: { nombre: FILE_NAME, tamano: whole.length, sha256: sha(whole) },
      partes: parts.map((p) => ({ tamano: p.length, sha256: sha(p) })),
    };
    if (url.pathname === "/api/recursos/catalog") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ recursos: [resource] }));
    }
    if (url.pathname === "/api/recursos/catalog/demo-vm") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(resource));
    }
    if (url.pathname === "/api/recursos/ticket" && req.method === "POST") {
      let raw = "";
      for await (const c of req) raw += c;
      const { part } = JSON.parse(raw) as { part: number };
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify({
          sources: [
            { mirror: "github", url: `/mock/github/${part}` },
            { mirror: "drive", url: `/mock/drive/${part}`, headers: { Authorization: "Bearer test" } },
          ],
        }),
      );
    }
    const mock = /^\/mock\/(github|drive)\/(\d+)$/.exec(url.pathname);
    if (mock) {
      const [, mirror, idx] = mock as unknown as [string, "github" | "drive", string];
      const start = /bytes=(\d+)-/.exec(req.headers.range ?? "")?.[1] ?? "0";
      stats[mirror].push(`${idx}@${start}`);
      if (stats.delayMs) await new Promise((r) => setTimeout(r, stats.delayMs));
      const data = parts[Number(idx)]!;
      // GitHub se corta a mitad de la parte 1 en la primera petición.
      if (mirror === "github" && Number(idx) === stats.failGithubPart && start === "0") return sendBody(res, req, data, 70_000);
      return sendBody(res, req, data);
    }
    if (!url.pathname.startsWith("/recursos/")) throw new Error("fuera de /recursos");
    let path = normalize(join(DIST, url.pathname.slice("/recursos".length)));
    if (!path.startsWith(DIST)) throw new Error("fuera de dist");
    if (url.pathname.endsWith("/")) path = join(path, "index.html");
    const file = await readFile(path);
    res.writeHead(200, { "Content-Type": TYPES[extname(path)] ?? "application/octet-stream" });
    res.end(file);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
}).listen(PORT, () => console.log(`e2e server en http://localhost:${PORT}`));
