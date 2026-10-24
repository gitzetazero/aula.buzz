import type { Env } from "../env.ts";

export interface SyncResult {
  synced: boolean;
  detail?: string;
}

/** Reescribe la política "Clase" de Access con los emails activos. Sin configurar, no hace nada. */
export async function syncAccessPolicy(env: Env, emails: string[]): Promise<SyncResult> {
  const { CF_API_TOKEN, CF_ACCOUNT_ID, ACCESS_APP_ID, ACCESS_POLICY_ID } = env;
  if (!CF_API_TOKEN || !CF_ACCOUNT_ID || !ACCESS_APP_ID || !ACCESS_POLICY_ID) {
    return { synced: false, detail: "La sincronización con Access no está configurada" };
  }
  if (emails.length === 0) return { synced: false, detail: "Access exige al menos un email" };
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/access/apps/${ACCESS_APP_ID}/policies/${ACCESS_POLICY_ID}`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${CF_API_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Clase",
        decision: "allow",
        include: emails.map((email) => ({ email: { email } })),
      }),
    },
  );
  if (!res.ok) return { synced: false, detail: `Cloudflare respondió ${res.status}` };
  return { synced: true };
}
