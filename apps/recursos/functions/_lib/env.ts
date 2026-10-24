import type { AuthEnv } from "@aula/auth";

export interface Env extends AuthEnv {
  GH_ASSETS_TOKEN?: string;
  GH_ASSETS_REPO?: string;
  GDRIVE_SA_JSON?: string;
}
