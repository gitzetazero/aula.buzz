import preact from "@astrojs/preact";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://recursos.aula.buzz",
  output: "static",
  integrations: [preact()],
});
