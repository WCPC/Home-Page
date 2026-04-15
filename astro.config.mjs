// astro.config.mjs
import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import icon from "astro-icon"; // ← ★1. インポートを追加

import mdx from "@astrojs/mdx";

export default defineConfig({
  integrations: [
    tailwind(), // ← ★2. ここに追加
    icon(),
    mdx(),
  ],
});
