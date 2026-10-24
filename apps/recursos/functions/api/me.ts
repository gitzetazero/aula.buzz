import { handleMe } from "@aula/auth";
import type { Env } from "../_lib/env.ts";

export const onRequestGet: PagesFunction<Env> = ({ request, env }) => handleMe(request, env);
