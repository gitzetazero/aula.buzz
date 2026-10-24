// Utilidades JWT RS256 sobre WebCrypto: funcionan igual en Workers, Node y navegador.

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function base64UrlEncode(data: Uint8Array | string): string {
  const bytes = typeof data === "string" ? encoder.encode(data) : data;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(input: string): Uint8Array<ArrayBuffer> {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export interface DecodedJwt {
  header: { alg?: string; kid?: string; typ?: string };
  payload: Record<string, unknown>;
  signingInput: string;
  signature: Uint8Array<ArrayBuffer>;
}

export function decodeJwt(token: string): DecodedJwt | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts as [string, string, string];
  try {
    return {
      header: JSON.parse(decoder.decode(base64UrlDecode(h))),
      payload: JSON.parse(decoder.decode(base64UrlDecode(p))),
      signingInput: `${h}.${p}`,
      signature: base64UrlDecode(s),
    };
  } catch {
    return null;
  }
}

const RS256 = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" } as const;

export function importRsaPublicJwk(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey("jwk", jwk, RS256, false, ["verify"]);
}

export function importRsaPrivatePem(pem: string): Promise<CryptoKey> {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/, "")
    .replace(/-----END [^-]+-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(body);
  const der = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) der[i] = binary.charCodeAt(i);
  return crypto.subtle.importKey("pkcs8", der, RS256, false, ["sign"]);
}

export function verifyRs256(key: CryptoKey, jwt: DecodedJwt): Promise<boolean> {
  return crypto.subtle.verify(RS256, key, jwt.signature, encoder.encode(jwt.signingInput));
}

export async function signRs256(
  key: CryptoKey,
  payload: Record<string, unknown>,
  header: Record<string, unknown> = {},
): Promise<string> {
  const signingInput = [
    base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT", ...header })),
    base64UrlEncode(JSON.stringify(payload)),
  ].join(".");
  const signature = await crypto.subtle.sign(RS256, key, encoder.encode(signingInput));
  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}
