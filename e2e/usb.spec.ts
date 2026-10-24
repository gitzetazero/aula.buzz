import { expect, test, type Page } from "@playwright/test";
import { FILE_NAME, sha, whole } from "./fixture.ts";

/** Simula el selector de carpetas con una carpeta del sistema de archivos privado (OPFS). */
async function fakeUsb(page: Page) {
  await page.addInitScript(() => {
    const proto = FileSystemDirectoryHandle.prototype as unknown as Record<string, unknown>;
    proto.queryPermission = async () => "granted";
    proto.requestPermission = async () => "granted";
    (window as unknown as Record<string, unknown>).showDirectoryPicker = async () => {
      const root = await navigator.storage.getDirectory();
      return root.getDirectoryHandle("USB-TEST", { create: true });
    };
  });
}

async function readUsbFile(page: Page, name: string) {
  return page.evaluate(async (n) => {
    const root = await navigator.storage.getDirectory();
    const usb = await root.getDirectoryHandle("USB-TEST");
    const file = await (await usb.getFileHandle(n)).getFile();
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return { size: file.size, sha: [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("") };
  }, name);
}

test.beforeEach(async ({ page, request }) => {
  await request.get("/__reset");
  await fakeUsb(page);
});

test("el catálogo lista el recurso, filtra y abre la ficha", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "VM de prueba" })).toBeVisible();
  await page.getByLabel("Buscar").fill("ubuntu");
  await expect(page.getByText("Ningún recurso coincide")).toBeVisible();
  await page.getByLabel("Buscar").fill("debian");
  await expect(page.getByRole("heading", { name: "VM de prueba" })).toBeVisible();

  await page.getByRole("link", { name: "VM de prueba" }).click();
  await expect(page.getByRole("heading", { name: "Ficha" })).toBeVisible();
  await expect(page.getByText(sha(whole))).toBeVisible();
});

test("descarga al USB, cambia de mirror a mitad de una parte y verifica el hash", async ({ page, request }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Conectar USB" }).click();
  await expect(page.getByText("Conectado")).toBeVisible();

  await page.getByRole("button", { name: /Guardar en el USB/ }).click();
  await expect(page.getByText("Listo en la raíz del USB")).toBeVisible({ timeout: 30_000 });

  const file = await readUsbFile(page, FILE_NAME);
  expect(file.size).toBe(whole.length);
  expect(file.sha).toBe(sha(whole));

  // GitHub se cortó tras 70.000 bytes en la parte 1 y Drive continuó desde ese byte exacto.
  const stats = (await (await request.get("/__stats")).json()) as { github: string[]; drive: string[] };
  expect(stats.github).toContain("1@0");
  expect(stats.drive).toContain("1@70000");
});

// Chromium headless se cae al leer de IndexedDB un handle de OPFS (el sustituto del USB en estos tests),
// así que la persistencia entre recargas solo se prueba con E2E_PERSISTENCE=1 en un Chromium donde funcione.
test("recuerda el USB al recargar", async ({ page }) => {
  test.skip(!process.env.E2E_PERSISTENCE, "requiere E2E_PERSISTENCE=1");
  await page.goto("/");
  await page.getByRole("button", { name: "Conectar USB" }).click();
  await expect(page.getByText("Conectado")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Nombre del USB")).toHaveValue("USB-TEST");
  await expect(page.getByRole("button", { name: "Añadir otro USB" })).toBeVisible();
});

test("sin USB conectado pide conectarlo", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Guardar en el USB/ }).click();
  await expect(page.getByText("Primero conecta tu USB.")).toBeVisible();
});

test("cancelar una descarga no deja archivo en el USB", async ({ page, request }) => {
  await request.get("/__slow?ms=5000"); // los mirrors tardan: da tiempo a cancelar
  await page.goto("/");
  await page.getByRole("button", { name: "Conectar USB" }).click();
  await expect(page.getByText("Conectado")).toBeVisible();
  await page.getByRole("button", { name: /Guardar en el USB/ }).click();
  await page.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByText("Cancelado")).toBeVisible();
  const exists = await page.evaluate(async (n) => {
    const usb = await (await navigator.storage.getDirectory()).getDirectoryHandle("USB-TEST");
    try {
      const f = await (await usb.getFileHandle(n)).getFile();
      return f.size > 0;
    } catch {
      return false;
    }
  }, FILE_NAME);
  expect(exists).toBe(false);
});
