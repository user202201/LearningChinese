import { defineConfig } from "vite";

// MOBILE=1: build for the iOS app (mobile/, later): relative paths, files are loaded from inside the app.
// Website: GitHub Pages project site https://<user>.github.io/LearningChinese/ (BASE_PATH=/ for a local build).
const mobile = !!process.env.MOBILE;

export default defineConfig({
  define: {
    __BUILD__: JSON.stringify(process.env.BUILD_ID ?? new Date().toISOString().slice(0, 16).replace("T", " ")),
  },
  base: mobile ? "./" : process.env.BASE_PATH ?? "/LearningChinese/",
  // (".test" hosts: the end-to-end tests open the dev server under a made-up host name to check the "public repository" refusal)
  // pre-bundle at start: otherwise the dev server finds pinyin-pro in the middle of a page visit and reloads the page (flaky tests)
  optimizeDeps: { include: ["pinyin-pro", "qrcode"] },
  server: { allowedHosts: [".test"] },
  build: mobile ? { outDir: "dist-app" } : {},
});
