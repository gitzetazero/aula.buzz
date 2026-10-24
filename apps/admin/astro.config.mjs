import preact from "@astrojs/preact";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://aula.buzz",
  base: "/admin",
  output: "static",
  integrations: [preact()],
});
