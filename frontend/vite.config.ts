import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";

type StaticNewsItem = {
  category?: string;
  image_url?: string;
};

function getSizedImageUrl(url: string, size: number) {
  if (url.includes("mzstatic.com/image/thumb/")) {
    return url.replace(/\/\d+x\d+bb\.(png|jpg|jpeg|webp)(\?.*)?$/i, `/${size}x${size}bb.$1$2`);
  }

  if (url.startsWith("http") && (url.includes("9to5mac.com/") || url.includes("appleinsider.com/"))) {
    const imageUrl = new URL(url);
    imageUrl.searchParams.set("w", String(size));
    return imageUrl.toString();
  }

  return url;
}

function getNewsHeroPreload() {
  if (process.env.GITHUB_PAGES !== "true") {
    return "";
  }

  const dataPath = fileURLToPath(new URL("./public/data/news.json", import.meta.url));
  const data = JSON.parse(readFileSync(dataPath, "utf8")) as { items?: StaticNewsItem[] };
  const leadArticle = data.items?.find((item) => item.category === "News" && item.image_url);

  if (!leadArticle?.image_url) {
    throw new Error("No lead news image found for GitHub Pages preload.");
  }

  return `<link rel="preload" as="image" fetchpriority="high" href="${getSizedImageUrl(leadArticle.image_url, 800)}" />`;
}

export default defineConfig({
  base: process.env.GITHUB_PAGES === "true" ? "/macready/" : "/",
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "macready-news-hero-preload",
      transformIndexHtml(html) {
        const preload = getNewsHeroPreload();
        return preload ? html.replace("    <title>MacReady</title>", `    ${preload}\n    <title>MacReady</title>`) : html;
      },
    },
    {
      name: "macready-spa-404",
      closeBundle() {
        if (process.env.GITHUB_PAGES !== "true") return;
        const indexHtml = readFileSync("dist/index.html", "utf8");
        writeFileSync("dist/404.html", indexHtml);
      },
    },
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    proxy: {
      "/api": "http://localhost:8421",
      "/videos": "http://localhost:8421",
    },
  },
});
