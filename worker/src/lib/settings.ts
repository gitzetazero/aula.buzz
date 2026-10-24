import { getSetting } from "@aula/db";
import type { Env } from "../env.ts";

export interface SectionSetting {
  id: string;
  nombre: string;
  descripcion: string;
  /** Ruta dentro de aula.buzz; sin ella la sección figura como «Próximamente». */
  url?: string;
  visible: boolean;
}

export const DEFAULT_SECTIONS: SectionSetting[] = [
  { id: "recursos", nombre: "Recursos", descripcion: "Máquinas virtuales, ISOs y archivos de clase, directos a tu USB.", url: "/recursos/", visible: true },
  { id: "apuntes", nombre: "Apuntes", descripcion: "Próximamente.", visible: true },
  { id: "calendario", nombre: "Calendario", descripcion: "Próximamente.", visible: true },
];

export const DEFAULT_MIRRORS = ["drive", "github"];

export async function getSections(env: Env): Promise<SectionSetting[]> {
  return (await getSetting<SectionSetting[]>(env.DB, "sections")) ?? DEFAULT_SECTIONS;
}

export async function getMirrors(env: Env): Promise<string[]> {
  return (await getSetting<string[]>(env.DB, "mirrors")) ?? DEFAULT_MIRRORS;
}

export async function getAnnouncement(env: Env): Promise<string> {
  return (await getSetting<string>(env.DB, "announcement")) ?? "";
}
