// URLs de los sitios de aula.buzz. Se pueden sobrescribir en build con
// PUBLIC_PORTAL_URL / PUBLIC_RECURSOS_URL (útil para forks y desarrollo).

const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};

export const PORTAL_URL = env.PUBLIC_PORTAL_URL ?? "https://aula.buzz";
export const RECURSOS_URL = env.PUBLIC_RECURSOS_URL ?? "https://recursos.aula.buzz";

/** El logout de Access cierra la sesión en todos los subdominios. */
export const LOGOUT_URL = `${PORTAL_URL}/cdn-cgi/access/logout`;

export interface Section {
  id: string;
  nombre: string;
  descripcion: string;
  url?: string;
}

export const SECTIONS: Section[] = [
  {
    id: "recursos",
    nombre: "Recursos",
    descripcion: "Máquinas virtuales, ISOs y archivos de clase, directos a tu USB.",
    url: RECURSOS_URL,
  },
  { id: "apuntes", nombre: "Apuntes", descripcion: "Próximamente." },
  { id: "calendario", nombre: "Calendario", descripcion: "Próximamente." },
];
