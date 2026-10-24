import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { clearCertsCache, getUser } from "./index.ts";
import { signRs256 } from "./jwt.ts";

const TEAM = "aula.cloudflareaccess.com";
const AUD = "aud-123";
let privateKey: CryptoKey;
let publicJwk: JsonWebKey;

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  privateKey = pair.privateKey;
  publicJwk = { ...(await crypto.subtle.exportKey("jwk", pair.publicKey)), kid: "k1" } as JsonWebKey;
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearCertsCache();
});

function stubCerts() {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ keys: [publicJwk] })));
}

function token(overrides: Record<string, unknown> = {}, kid = "k1") {
  const now = Math.floor(Date.now() / 1000);
  return signRs256(
    privateKey,
    { iss: `https://${TEAM}`, aud: [AUD], email: "ana@clase.es", exp: now + 600, iat: now, ...overrides },
    { kid },
  );
}

const env = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD };
const req = (jwt?: string, url = "https://recursos.aula.buzz/api/me") =>
  new Request(url, { headers: jwt ? { "Cf-Access-Jwt-Assertion": jwt } : {} });

describe("getUser", () => {
  it("acepta un JWT válido de Access", async () => {
    stubCerts();
    expect(await getUser(req(await token()), env)).toEqual({ email: "ana@clase.es" });
  });

  it("lee el token de la cookie CF_Authorization", async () => {
    stubCerts();
    const r = new Request("https://aula.buzz/", { headers: { Cookie: `a=b; CF_Authorization=${await token()}` } });
    expect(await getUser(r, env)).toEqual({ email: "ana@clase.es" });
  });

  it.each([
    ["caducado", { exp: Math.floor(Date.now() / 1000) - 10 }],
    ["otra audiencia", { aud: ["otra"] }],
    ["otro emisor", { iss: "https://malo.cloudflareaccess.com" }],
    ["sin email", { email: undefined }],
  ])("rechaza un token %s", async (_, overrides) => {
    stubCerts();
    expect(await getUser(req(await token(overrides)), env)).toBeNull();
  });

  it("rechaza firmas manipuladas", async () => {
    stubCerts();
    const [h, , s] = (await token()).split(".");
    const forged = Buffer.from(JSON.stringify({ iss: `https://${TEAM}`, aud: [AUD], email: "x@x", exp: 9e9 })).toString("base64url");
    expect(await getUser(req(`${h}.${forged}.${s}`), env)).toBeNull();
  });

  it("rechaza kid desconocido", async () => {
    stubCerts();
    expect(await getUser(req(await token({}, "otro")), env)).toBeNull();
  });

  it("deniega si falta configuración (fail closed)", async () => {
    expect(await getUser(req(await token()), {})).toBeNull();
  });

  it("deniega si no hay token", async () => {
    expect(await getUser(req(), env)).toBeNull();
  });

  it("el usuario de desarrollo solo funciona en localhost", async () => {
    const dev = { ...env, AUTH_DEV_EMAIL: "dev@local" };
    expect(await getUser(req(undefined, "http://localhost:8788/api/me"), dev)).toEqual({ email: "dev@local" });
    expect(await getUser(req(), dev)).toBeNull();
  });
});
