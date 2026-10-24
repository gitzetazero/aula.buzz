import type { AuthEnv } from "@aula/auth";

export interface Env extends AuthEnv {
  DB: D1Database;
  /** Administrador principal: no se le puede quitar el rol, desactivar ni borrar, y siempre tiene acceso. */
  OWNER_EMAIL?: string;
  ASSETS: Fetcher;
  /** Lectura del repo privado de releases (descargas). */
  GH_ASSETS_TOKEN?: string;
  GH_ASSETS_REPO?: string;
  /** Escritura (Contents: write) para subir y borrar assets desde el panel. */
  GH_UPLOAD_TOKEN?: string;
  GDRIVE_SA_JSON?: string;
  /** Carpeta de Drive donde el panel sube los recursos. */
  GDRIVE_FOLDER_ID?: string;
  /** Token de API de Cloudflare con permiso de editar Access, para sincronizar la lista de usuarios. */
  CF_API_TOKEN?: string;
  CF_ACCOUNT_ID?: string;
  ACCESS_APP_ID?: string;
  ACCESS_POLICY_ID?: string;
}

export interface Ctx {
  request: Request;
  env: Env;
  url: URL;
  params: Record<string, string>;
  email: string;
}
