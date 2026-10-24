// USB desde el navegador (File System Access API, solo Chromium).
//
// Los navegadores no permiten listar unidades, así que el usuario elige la raíz
// de su USB una vez; el permiso y el handle se guardan en IndexedDB y desde
// entonces aparece en la lista «Mis USB» para elegir con un clic.

import { get, set } from "idb-keyval";
import type { Sink } from "./download.ts";

export interface UsbEntry {
  id: string;
  alias: string;
  handle: FileSystemDirectoryHandle;
  addedAt: number;
}

export type UsbStatus = "ready" | "needs-permission" | "unavailable";

type PermissionHandle = FileSystemDirectoryHandle & {
  queryPermission(d: { mode: "readwrite" }): Promise<PermissionState>;
  requestPermission(d: { mode: "readwrite" }): Promise<PermissionState>;
};
type WritableStream_ = {
  write(data: { type: "write"; position: number; data: Uint8Array<ArrayBuffer> }): Promise<void>;
  close(): Promise<void>;
  abort(): Promise<void>;
};
type FileHandleWithWritable = FileSystemFileHandle & { createWritable(): Promise<WritableStream_> };

const STORE_KEY = "aula:usbs";

export function supportsDirectUsb(): boolean {
  return typeof window !== "undefined" && typeof (window as { showDirectoryPicker?: unknown }).showDirectoryPicker === "function";
}

export function isWindows(): boolean {
  return typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent);
}

/** En Windows la raíz de una unidad se llama «E:\». En otros sistemas no se puede saber. */
export function looksLikeDriveRoot(name: string): boolean {
  return /^[A-Za-z]:\\?$/.test(name);
}

export async function listUsbs(): Promise<UsbEntry[]> {
  try {
    return (await get<UsbEntry[]>(STORE_KEY)) ?? [];
  } catch {
    return [];
  }
}

async function saveUsbs(usbs: UsbEntry[]): Promise<void> {
  try {
    await set(STORE_KEY, usbs);
  } catch {
    // Navegación privada: funciona en esta sesión pero no se recuerda.
  }
}

export async function pickUsb(existing: UsbEntry[]): Promise<{ entry: UsbEntry; list: UsbEntry[]; suspicious: boolean }> {
  const handle = await (
    window as unknown as { showDirectoryPicker(o: object): Promise<FileSystemDirectoryHandle> }
  ).showDirectoryPicker({ id: "aula-usb", mode: "readwrite", startIn: "desktop" });

  for (const known of existing) {
    if (await known.handle.isSameEntry(handle)) return { entry: known, list: existing, suspicious: false };
  }
  const entry: UsbEntry = {
    id: crypto.randomUUID(),
    alias: handle.name.replace(/[\\:]+$/, "") || "USB",
    handle,
    addedAt: Date.now(),
  };
  const list = [...existing, entry];
  await saveUsbs(list);
  return { entry, list, suspicious: isWindows() && !looksLikeDriveRoot(handle.name) };
}

export async function forgetUsb(list: UsbEntry[], id: string): Promise<UsbEntry[]> {
  const next = list.filter((u) => u.id !== id);
  await saveUsbs(next);
  return next;
}

export async function renameUsb(list: UsbEntry[], id: string, alias: string): Promise<UsbEntry[]> {
  const next = list.map((u) => (u.id === id ? { ...u, alias: alias.trim() || u.alias } : u));
  await saveUsbs(next);
  return next;
}

/** ¿Podemos escribir ahora? No pide permiso (no requiere gesto del usuario). */
export async function usbStatus(entry: UsbEntry): Promise<UsbStatus> {
  try {
    const handle = entry.handle as PermissionHandle;
    if ((await handle.queryPermission({ mode: "readwrite" })) !== "granted") {
      // Comprobar que el USB sigue conectado exige permiso: si está desconectado, el handle falla al pedirlo.
      return "needs-permission";
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of (handle as unknown as { keys(): AsyncIterable<string> }).keys()) break;
    return "ready";
  } catch {
    return "unavailable";
  }
}

/** Debe llamarse desde un clic del usuario. */
export async function requestUsbPermission(entry: UsbEntry): Promise<boolean> {
  try {
    return (await (entry.handle as PermissionHandle).requestPermission({ mode: "readwrite" })) === "granted";
  } catch {
    return false;
  }
}

export interface OpenedFile {
  sink: Sink;
  commit(): Promise<void>;
  discard(): Promise<void>;
}

/**
 * Abre `name` en la raíz del USB. Chromium escribe en un archivo temporal y lo
 * renombra al cerrar, así que una descarga cancelada no deja basura ni deja a
 * medias un archivo que ya existiera.
 */
export async function openUsbFile(entry: UsbEntry, name: string): Promise<OpenedFile> {
  const fileHandle = (await entry.handle.getFileHandle(name, { create: true })) as FileHandleWithWritable;
  const writable = await fileHandle.createWritable();
  return {
    sink: { write: (position, data) => writable.write({ type: "write", position, data: data as Uint8Array<ArrayBuffer> }) },
    commit: () => writable.close(),
    discard: () => writable.abort().catch(() => {}),
  };
}

export async function readUsbFile(entry: UsbEntry, name: string): Promise<File> {
  return (await entry.handle.getFileHandle(name)).getFile();
}
