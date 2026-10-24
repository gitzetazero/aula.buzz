export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api/admin/${path}`, {
    method: init.method ?? "GET",
    credentials: "same-origin",
    headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!res.ok) {
    const message = ((await res.json().catch(() => null)) as { error?: string } | null)?.error;
    throw new ApiError(message ?? `El servidor respondió ${res.status}`, res.status);
  }
  return (await res.json()) as T;
}

export interface UserRow {
  email: string;
  role: "admin" | "student";
  active: boolean;
  created_at: string;
}
export interface AccessResult {
  synced: boolean;
  detail?: string;
}
export interface Part {
  tamano: number;
  sha256: string;
  github_asset_id?: number;
  drive_id?: string;
}
export interface Resource {
  id: string;
  nombre: string;
  descripcion: string;
  asignatura: string;
  tipo: "vm" | "iso" | "archivo" | "comprimido";
  so?: string;
  tags: string[];
  actualizado: string;
  hipervisor?: string;
  requisitos?: { ram_gb?: number; disco_gb?: number; cpus?: number };
  credenciales: { usuario: string; password: string; nota?: string }[];
  instrucciones?: string;
  archivo: { nombre: string; tamano: number; sha256: string };
  partes: Part[];
}
export interface SectionSetting {
  id: string;
  nombre: string;
  descripcion: string;
  url?: string;
  visible: boolean;
}

export const formatBytes = (n: number) => {
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};
