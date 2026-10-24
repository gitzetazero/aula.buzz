import { afterEach, describe, expect, it, vi } from "vitest";
import { clearDriveTokenCache, getDriveToken, parseServiceAccount } from "./gdrive.ts";
import { decodeJwt } from "@aula/auth/jwt";

async function makeAccount() {
  const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(der).toString("base64")}\n-----END PRIVATE KEY-----\n`;
  return { client_email: "aula@proyecto.iam.gserviceaccount.com", private_key: pem };
}

afterEach(() => {
  vi.unstubAllGlobals();
  clearDriveTokenCache();
});

describe("getDriveToken", () => {
  it("firma una aserción JWT válida y cachea el token", async () => {
    const sa = await makeAccount();
    const fetchMock = vi.fn(async () => Response.json({ access_token: "tok", expires_in: 3600 }));
    vi.stubGlobal("fetch", fetchMock);

    const first = await getDriveToken(sa, 1_000_000);
    const second = await getDriveToken(sa, 1_000_000 + 60_000);
    expect(first.token).toBe("tok");
    expect(second.token).toBe("tok");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const body = (fetchMock.mock.calls[0] as unknown as [string, { body: URLSearchParams }])[1].body;
    expect(body.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
    const jwt = decodeJwt(body.get("assertion")!)!;
    expect(jwt.header.alg).toBe("RS256");
    expect(jwt.payload).toMatchObject({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/drive.readonly",
      aud: "https://oauth2.googleapis.com/token",
    });
  });

  it("renueva el token cuando está a punto de caducar", async () => {
    const sa = await makeAccount();
    const fetchMock = vi.fn(async () => Response.json({ access_token: "tok", expires_in: 3600 }));
    vi.stubGlobal("fetch", fetchMock);
    await getDriveToken(sa, 0);
    await getDriveToken(sa, 3_560_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falla con claridad si Google rechaza la cuenta", async () => {
    const sa = await makeAccount();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 400 })));
    await expect(getDriveToken(sa)).rejects.toThrow(/rechazó/);
  });
});

describe("parseServiceAccount", () => {
  it("valida los campos obligatorios", () => {
    expect(() => parseServiceAccount(undefined)).toThrow(/Falta/);
    expect(() => parseServiceAccount("{}")).toThrow(/client_email/);
  });
});
