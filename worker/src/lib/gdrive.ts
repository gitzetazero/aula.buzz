// Acceso a Google Drive con una service account (lectura por defecto; escritura solo para el panel de admin).
// Se firma un JWT con la clave privada (WebCrypto) y se cambia por un access
// token de 1 h con scope drive.readonly. La carpeta se comparte con el email
// de la service account como «Lector».

import { importRsaPrivatePem, signRs256 } from "@aula/auth/jwt";

export interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

export const SCOPE_READ = "https://www.googleapis.com/auth/drive.readonly";
export const SCOPE_WRITE = "https://www.googleapis.com/auth/drive";
const TOKEN_URI = "https://oauth2.googleapis.com/token";
const SAFETY_MS = 60_000;

let cache: { email: string; scope: string; token: string; expiresAt: number } | null = null;

export function parseServiceAccount(json: string | undefined): ServiceAccount {
  if (!json) throw new Error("Falta GDRIVE_SA_JSON");
  const sa = JSON.parse(json) as Partial<ServiceAccount>;
  if (!sa.client_email || !sa.private_key) throw new Error("GDRIVE_SA_JSON no tiene client_email/private_key");
  return sa as ServiceAccount;
}

export async function getDriveToken(
  sa: ServiceAccount,
  now = Date.now(),
  scope = SCOPE_READ,
): Promise<{ token: string; expiresAt: number }> {
  if (cache && cache.email === sa.client_email && cache.scope === scope && cache.expiresAt - SAFETY_MS > now) return cache;

  const iat = Math.floor(now / 1000);
  const assertion = await signRs256(await importRsaPrivatePem(sa.private_key), {
    iss: sa.client_email,
    scope,
    aud: sa.token_uri ?? TOKEN_URI,
    iat,
    exp: iat + 3600,
  });
  const res = await fetch(sa.token_uri ?? TOKEN_URI, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!res.ok) throw new Error(`Google rechazó la service account (${res.status})`);
  const { access_token, expires_in } = (await res.json()) as { access_token: string; expires_in: number };
  cache = { email: sa.client_email, scope, token: access_token, expiresAt: now + expires_in * 1000 };
  return cache;
}

export function clearDriveTokenCache(): void {
  cache = null;
}

export function driveFileUrl(fileId: string): string {
  return `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`;
}
