import { handleMe, type AuthEnv } from "@aula/auth";

export const onRequestGet: PagesFunction<AuthEnv> = ({ request, env }) => handleMe(request, env);
