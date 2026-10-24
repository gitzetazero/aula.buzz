// Autenticación común de aula.buzz y sus subdominios.
//
// El login lo hace Cloudflare Access (una sola aplicación para aula.buzz y
// *.aula.buzz). Access añade a cada petición la cabecera
// `Cf-Access-Jwt-Assertion`; aquí la verificamos otra vez como defensa en
// profundidad. Si falta configuración, se deniega (fail closed).

import { decodeJwt, importRsaPublicJwk, verifyRs256 } from "./jwt.ts";

export interface AuthEnv {
  /** p. ej. `aula.cloudflareaccess.com` */
  ACCESS_TEAM_DOMAIN?: string;
  /** Application Audience (AUD) tag de la aplicación de Access. */
  ACCESS_AUD?: string;
  /** Solo desarrollo: usuario simulado para peticiones a localhost. */
  AUTH_DEV_EMAIL?: string;
}

export interface User {
  email: string;
}

const CERTS_TTL_MS = 10 * 60 * 1000;
let certsCache: { team: string; keys: JsonWebKey[]; fetchedAt: number } | null = null;

async function getCerts(team: string, force = false): Promise<JsonWebKey[]> {
  if (!force && certsCache?.team === team && Date.now() - certsCache.fetchedAt < CERTS_TTL_MS) {
    return certsCache.keys;
  }
  const res = await fetch(`https://${team}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`No se pudieron obtener las claves de Access (${res.status})`);
  const { keys } = (await res.json()) as { keys: JsonWebKey[] };
  certsCache = { team, keys, fetchedAt: Date.now() };
  return keys;
}

/** Solo para tests. */
export function clearCertsCache(): void {
  certsCache = null;
}

function readToken(request: Request): string | null {
  const header = request.headers.get("Cf-Access-Jwt-Assertion");
  if (header) return header;
  const cookie = request.headers.get("Cookie") ?? "";
  const match = cookie.match(/(?:^|;\s*)CF_Authorization=([^;]+)/);
  return match?.[1] ?? null;
}

function isLocalhost(request: Request): boolean {
  const { hostname } = new URL(request.url);
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

export async function verifyAccessToken(
  token: string,
  team: string,
  aud: string,
  now = Date.now(),
): Promise<User | null> {
  const jwt = decodeJwt(token);
  if (!jwt || jwt.header.alg !== "RS256" || !jwt.header.kid) return null;

  let keys = await getCerts(team);
  let jwk = keys.find((k) => (k as { kid?: string }).kid === jwt.header.kid);
  if (!jwk) {
    // Access rota las claves: reintenta una vez sin caché.
    keys = await getCerts(team, true);
    jwk = keys.find((k) => (k as { kid?: string }).kid === jwt.header.kid);
  }
  if (!jwk) return null;
  if (!(await verifyRs256(await importRsaPublicJwk(jwk), jwt))) return null;

  const { iss, aud: tokenAud, exp, nbf, email } = jwt.payload as {
    iss?: string;
    aud?: string | string[];
    exp?: number;
    nbf?: number;
    email?: string;
  };
  const seconds = now / 1000;
  if (iss !== `https://${team}`) return null;
  if (!(Array.isArray(tokenAud) ? tokenAud.includes(aud) : tokenAud === aud)) return null;
  if (typeof exp !== "number" || exp < seconds) return null;
  if (typeof nbf === "number" && nbf > seconds + 60) return null;
  if (typeof email !== "string" || !email) return null;
  return { email };
}

export async function getUser(request: Request, env: AuthEnv): Promise<User | null> {
  if (env.AUTH_DEV_EMAIL && isLocalhost(request)) return { email: env.AUTH_DEV_EMAIL };
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return null;
  const token = readToken(request);
  if (!token) return null;
  try {
    return await verifyAccessToken(token, env.ACCESS_TEAM_DOMAIN, env.ACCESS_AUD);
  } catch {
    return null;
  }
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...init.headers },
  });
}

export function unauthorized(): Response {
  return json({ error: "No has iniciado sesión" }, { status: 401 });
}

/** Handler de `/api/me`, compartido por todas las apps. */
export async function handleMe(request: Request, env: AuthEnv): Promise<Response> {
  const user = await getUser(request, env);
  return user ? json(user) : unauthorized();
}
