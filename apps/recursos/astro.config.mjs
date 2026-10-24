import preact from "@astrojs/preact";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://aula.buzz",
  base: "/recursos",
  output: "static",
  integrations: [preact()],
});
