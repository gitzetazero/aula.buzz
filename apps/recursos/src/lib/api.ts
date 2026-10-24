import type { ClientResource } from "./store.ts";

/** Recurso tal como lo sirve /api/recursos/catalog (sin ids de mirrors). */
export interface CatalogResource {
  id: string;
  nombre: string;
  descripcion: string;
  asignatura: string;
  tipo: string;
  so?: string;
  tags: string[];
  actualizado: string;
  hipervisor?: string;
  requisitos?: { ram_gb?: number; disco_gb?: number; cpus?: number };
  credenciales: { usuario: string; password: string; nota?: string }[];
  instrucciones?: string;
  archivo: { nombre: string; tamano: number; sha256: string };
  partes: { tamano: number; sha256: string }[];
  directUrl?: string;
}

export function toClient(r: CatalogResource): ClientResource {
  return { id: r.id, nombre: r.nombre, archivo: r.archivo, partes: r.partes.map((p) => ({ size: p.tamano, sha256: p.sha256 })) };
}

export async function loadCatalog(): Promise<CatalogResource[]> {
  const res = await fetch("/api/recursos/catalog", { credentials: "same-origin" });
  if (!res.ok) throw new Error(res.status === 401 ? "Tu sesión ha caducado. Recarga la página." : `El servidor respondió ${res.status}`);
  return ((await res.json()) as { recursos: CatalogResource[] }).recursos;
}

export async function loadResource(id: string): Promise<CatalogResource> {
  const res = await fetch(`/api/recursos/catalog/${encodeURIComponent(id)}`, { credentials: "same-origin" });
  if (res.status === 404) throw new Error("Este recurso no existe o se ha retirado.");
  if (!res.ok) throw new Error(`El servidor respondió ${res.status}`);
  return (await res.json()) as CatalogResource;
}
