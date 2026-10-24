import { json } from "@aula/auth";
import type { Env } from "./env.ts";
import { handleAdmin } from "./routes/admin.ts";
import { me, settings } from "./routes/public.ts";
import { catalog, catalogOne, githubAsset, ticket } from "./routes/recursos.ts";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (!pathname.startsWith("/api/")) return env.ASSETS.fetch(request);

    const path = pathname.slice("/api/".length).split("/").filter(Boolean);
    const method = request.method;
    try {
      if (path[0] === "me" && method === "GET") return await me(request, env);
      if (path[0] === "settings" && method === "GET") return await settings(request, env);
      if (path[0] === "recursos") {
        if (path[1] === "catalog" && !path[2] && method === "GET") return await catalog(request, env);
        if (path[1] === "catalog" && path[2] && method === "GET") return await catalogOne(request, env, decodeURIComponent(path[2]));
        if (path[1] === "ticket" && method === "POST") return await ticket(request, env);
        if (path[1] === "gh" && path[2] && method === "GET") return await githubAsset(request, env, path[2]);
      }
      if (path[0] === "admin") return await handleAdmin(request, env, path.slice(1));
      return json({ error: "No encontrado" }, { status: 404 });
    } catch (error) {
      console.error(error);
      return json({ error: "Error interno" }, { status: 500 });
    }
  },
};
