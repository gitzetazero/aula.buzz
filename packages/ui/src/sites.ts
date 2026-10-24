// Secciones de aula.buzz. Viven todas bajo el mismo dominio, en rutas
// (/recursos, /admin…). Estos valores son los de fábrica: el panel de admin
// puede ocultarlas, renombrarlas o añadir otras (se leen de /api/settings).

/** El logout de Access cierra la sesión de todo el dominio. */
export const LOGOUT_URL = "/cdn-cgi/access/logout";

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
    url: "/recursos/",
  },
  { id: "apuntes", nombre: "Apuntes", descripcion: "Próximamente." },
  { id: "calendario", nombre: "Calendario", descripcion: "Próximamente." },
];
