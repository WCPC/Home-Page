// astro.config.mjs
import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import icon from "astro-icon"; // ← ★1. インポートを追加
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

import mdx from "@astrojs/mdx";

export default defineConfig({
  site: "https://wcpc.pages.dev",
  integrations: [
    tailwind(), // ← ★2. ここに追加
    icon(),
    mdx(),
  ],
  markdown: {
    remarkPlugins: [remarkMath],
    rehypePlugins: [rehypeKatex],
  },
});
