// Estado compartido de la interfaz de descargas (USB elegido + cola).
// Es un módulo singleton: todas las islas de la página lo comparten.

import { useEffect, useState } from "preact/hooks";
import { DownloadAbortedError, downloadFile, type PartSpec } from "./download.ts";
import { describeError } from "./format.ts";
import { fetchSources } from "./mirrors.ts";
import {
  forgetUsb, listUsbs, openUsbFile, pickUsb, readUsbFile, renameUsb, requestUsbPermission, usbStatus,
  type UsbEntry, type UsbStatus,
} from "./usb.ts";
import { hashFile } from "./verify.ts";

export interface ClientResource {
  id: string;
  nombre: string;
  archivo: { nombre: string; tamano: number; sha256: string };
  partes: PartSpec[];
}

export type JobStatus = "queued" | "running" | "verifying" | "done" | "error" | "cancelled";

export interface Job {
  id: string;
  resource: ClientResource;
  usbId: string;
  status: JobStatus;
  bytes: number;
  startedAt?: number;
  mirror?: string;
  notice?: string;
  error?: string;
}

interface State {
  usbs: UsbEntry[];
  statuses: Record<string, UsbStatus>;
  selectedUsbId: string | null;
  verify: boolean;
  jobs: Job[];
  suspiciousRoot: boolean;
  loaded: boolean;
}

let state: State = { usbs: [], statuses: {}, selectedUsbId: null, verify: true, jobs: [], suspiciousRoot: false, loaded: false };
const listeners = new Set<() => void>();
const controllers = new Map<string, AbortController>();
let running = false;

function setState(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function patchJob(id: string, patch: Partial<Job>) {
  setState({ jobs: state.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)) });
}

export function useStore(): State {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return state;
}

export async function init() {
  if (state.loaded) return;
  const usbs = await listUsbs();
  setState({ usbs, loaded: true, selectedUsbId: usbs[0]?.id ?? null });
  await refreshStatuses();
}

export async function refreshStatuses() {
  const entries = await Promise.all(state.usbs.map(async (u) => [u.id, await usbStatus(u)] as const));
  setState({ statuses: Object.fromEntries(entries) });
}

export async function addUsb() {
  try {
    const { entry, list, suspicious } = await pickUsb(state.usbs);
    setState({ usbs: list, selectedUsbId: entry.id, suspiciousRoot: suspicious });
    await refreshStatuses();
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return; // el usuario canceló el selector
    throw error;
  }
}

export async function selectUsb(id: string) {
  const entry = state.usbs.find((u) => u.id === id);
  setState({ selectedUsbId: id, suspiciousRoot: false });
  if (entry && state.statuses[id] !== "ready") {
    await requestUsbPermission(entry);
    await refreshStatuses();
  }
}

export async function removeUsb(id: string) {
  const usbs = await forgetUsb(state.usbs, id);
  setState({ usbs, selectedUsbId: state.selectedUsbId === id ? (usbs[0]?.id ?? null) : state.selectedUsbId });
}

export async function setAlias(id: string, alias: string) {
  setState({ usbs: await renameUsb(state.usbs, id, alias) });
}

export function setVerify(verify: boolean) {
  setState({ verify });
}

/** Llamar desde un clic: pide el permiso del USB si hace falta. */
export async function enqueue(resource: ClientResource): Promise<string | null> {
  const usb = state.usbs.find((u) => u.id === state.selectedUsbId);
  if (!usb) return "Primero conecta tu USB.";
  if (state.statuses[usb.id] !== "ready" && !(await requestUsbPermission(usb))) {
    return "Necesitamos permiso para escribir en el USB.";
  }
  await refreshStatuses();
  if (state.jobs.some((j) => j.resource.id === resource.id && j.usbId === usb.id && ["queued", "running", "verifying"].includes(j.status))) {
    return "Ese recurso ya está en la cola.";
  }
  setState({
    jobs: [...state.jobs, { id: crypto.randomUUID(), resource, usbId: usb.id, status: "queued", bytes: 0 }],
  });
  void runQueue();
  return null;
}

export function cancelJob(id: string) {
  controllers.get(id)?.abort();
  if (state.jobs.find((j) => j.id === id)?.status === "queued") patchJob(id, { status: "cancelled" });
}

export function clearFinished() {
  setState({ jobs: state.jobs.filter((j) => ["queued", "running", "verifying"].includes(j.status)) });
}

export function hasActiveJobs(): boolean {
  return state.jobs.some((j) => j.status === "running" || j.status === "verifying");
}

async function runQueue() {
  if (running) return;
  running = true;
  let wakeLock: { release(): Promise<void> } | null = null;
  try {
    wakeLock = await (navigator as unknown as { wakeLock?: { request(t: "screen"): Promise<{ release(): Promise<void> }> } }).wakeLock?.request("screen") ?? null;
  } catch {
    wakeLock = null;
  }
  try {
    for (let job = nextQueued(); job; job = nextQueued()) await runJob(job);
  } finally {
    running = false;
    await wakeLock?.release().catch(() => {});
  }
}

const nextQueued = () => state.jobs.find((j) => j.status === "queued");

async function runJob(job: Job) {
  const usb = state.usbs.find((u) => u.id === job.usbId);
  const { resource } = job;
  if (!usb) return patchJob(job.id, { status: "error", error: "El USB ya no está en tu lista." });

  const controller = new AbortController();
  controllers.set(job.id, controller);
  patchJob(job.id, { status: "running", startedAt: Date.now(), bytes: 0 });

  let file: Awaited<ReturnType<typeof openUsbFile>> | null = null;
  try {
    file = await openUsbFile(usb, resource.archivo.nombre);
    await downloadFile({
      parts: resource.partes,
      sink: file.sink,
      signal: controller.signal,
      getSources: (part, refresh) => fetchSources(resource.id, part, refresh),
      onProgress: (p) => patchJob(job.id, { bytes: p.bytes, mirror: p.mirror }),
      onMirrorSwitch: ({ from, reason }) => patchJob(job.id, { notice: `${from} falló (${reason}); probando otro mirror…` }),
    });
    await file.commit();
    file = null;

    if (state.verify) {
      patchJob(job.id, { status: "verifying", bytes: 0, notice: undefined });
      const written = await readUsbFile(usb, resource.archivo.nombre);
      const hash = await hashFile(written, (bytes) => patchJob(job.id, { bytes }), controller.signal);
      if (hash !== resource.archivo.sha256.toLowerCase()) {
        throw new Error("El archivo del USB no coincide con el original. Prueba otra vez o usa otro USB.");
      }
    }
    patchJob(job.id, { status: "done", bytes: resource.archivo.tamano, notice: undefined });
  } catch (error) {
    await file?.discard();
    if (error instanceof DownloadAbortedError || (error instanceof DOMException && error.name === "AbortError")) {
      patchJob(job.id, { status: "cancelled", notice: undefined });
    } else {
      patchJob(job.id, { status: "error", error: describeError(error, resource.archivo.tamano), notice: undefined });
    }
  } finally {
    controllers.delete(job.id);
  }
}
