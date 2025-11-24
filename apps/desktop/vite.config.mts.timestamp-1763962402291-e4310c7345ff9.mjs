// vite.config.mts
import { rmSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "file:///Users/trevorschachner/Documents/GitHub-Projects/OpenMarch/node_modules/.pnpm/vite@4.5.14_@types+node@20.19.15_lightningcss@1.30.1/node_modules/vite/dist/node/index.js";
import react from "file:///Users/trevorschachner/Documents/GitHub-Projects/OpenMarch/node_modules/.pnpm/@vitejs+plugin-react@4.6.0_vite@4.5.14_@types+node@20.19.15_lightningcss@1.30.1_/node_modules/@vitejs/plugin-react/dist/index.mjs";
import electron from "file:///Users/trevorschachner/Documents/GitHub-Projects/OpenMarch/node_modules/.pnpm/vite-plugin-electron@0.15.6_tree-kill@1.2.2_vite-plugin-electron-renderer@0.14.6/node_modules/vite-plugin-electron/dist/index.mjs";
import renderer from "file:///Users/trevorschachner/Documents/GitHub-Projects/OpenMarch/node_modules/.pnpm/vite-plugin-electron-renderer@0.14.6/node_modules/vite-plugin-electron-renderer/dist/index.mjs";

// package.json
var package_default = {
  name: "@openmarch/desktop",
  productName: "OpenMarch",
  description: "Free drill-writing software for the marching arts",
  version: "0.0.14",
  main: "dist-electron/main/index.js",
  author: "OpenMarch LLC",
  license: "AGPL-3.0",
  private: true,
  debug: {
    env: {
      VITE_DEV_SERVER_URL: "http://127.0.0.1:7777/"
    }
  },
  repository: {
    type: "git",
    url: "https://github.com/OpenMarch/OpenMarch.git"
  },
  scripts: {
    dev: "pnpm run apply-styles && vite",
    "app:prepare": "electron-rebuild -f -w better-sqlite3",
    postinstall: "electron-builder install-app-deps",
    build: "pnpm run apply-styles && tsc && vite build",
    "build:electron": "pnpm run apply-styles && tsc && vite build && electron-builder --dir",
    clean: "rimraf node_modules dist-electron release",
    "apply-styles": "node src/styles/apply-tailwind-vars.cjs",
    lint: "eslint . --fix",
    format: "prettier --write .",
    spellcheck: "cspell 'src/**' 'electron/**' '*.md'",
    fix: "prettier --write . && eslint . --fix && cspell 'src/**' 'electron/**' '*.md'",
    test: "vitest run --silent",
    "test:history": "VITEST_ENABLE_HISTORY=true VITEST_ENABLE_SQLJS=true vitest run",
    "test:watch": "vitest",
    "test:prepare": "pnpm rebuild better-sqlite3",
    "test:coverage": "pnpm test -- --coverage",
    "test:clearCache": "vitest --clearCache",
    e2e: "cross-env VITE_PUBLIC_PLAYWRIGHT_SESSION=true playwright test",
    "e2e:codegen": "node e2e/_codegen.mjs",
    migrate: "export DATABASE_URL=file:electron/database/migrations/_blank.dots && pnpm rebuild better-sqlite3 && drizzle-kit generate && tsx scripts/create-blank-db.ts"
  },
  dependencies: {
    "@fontsource/dm-mono": "^5.2.6",
    "@fontsource/dm-sans": "^5.2.6",
    "@openmarch/core": "workspace:*",
    "@openmarch/metronome": "workspace:*",
    "@openmarch/musicxml-parser": "workspace:*",
    "@openmarch/path-utility": "workspace:*",
    "@openmarch/ui": "workspace:*",
    "@phosphor-icons/react": "^2.1.10",
    "@radix-ui/react-alert-dialog": "^1.1.14",
    "@radix-ui/react-checkbox": "^1.3.2",
    "@radix-ui/react-collapsible": "^1.1.11",
    "@radix-ui/react-context-menu": "^2.2.15",
    "@radix-ui/react-dialog": "^1.1.14",
    "@radix-ui/react-dropdown-menu": "^2.1.15",
    "@radix-ui/react-form": "^0.1.7",
    "@radix-ui/react-popover": "^1.1.14",
    "@radix-ui/react-radio-group": "^1.3.7",
    "@radix-ui/react-select": "^2.2.5",
    "@radix-ui/react-switch": "^1.2.5",
    "@radix-ui/react-tabs": "^1.1.12",
    "@radix-ui/react-toggle-group": "^1.1.10",
    "@radix-ui/react-tooltip": "^1.2.7",
    "@sentry/electron": "^6.8.0",
    "@sentry/vite-plugin": "^3.5.0",
    "@tanstack/react-query": "^5.84.1",
    "@tanstack/react-query-devtools": "^5.84.2",
    "@tolgee/format-icu": "^6.2.6",
    "@tolgee/react": "^6.2.6",
    "@uiw/react-color": "^2.6.0",
    "@uiw/react-color-sketch": "^2.6.0",
    "@uiw/react-color-swatch": "^2.6.0",
    "adm-zip": "^0.5.16",
    "better-sqlite3": "^9.6.0",
    "class-variance-authority": "^0.7.1",
    clsx: "^2.1.1",
    "drizzle-orm": "^0.43.1",
    "electron-store": "^8.2.0",
    "electron-updater": "^6.6.2",
    fabric: "^5.5.2",
    jquery: "^3.7.1",
    jszip: "^3.10.1",
    lodash: "^4.17.21",
    nan: "^2.22.2",
    pdfkit: "^0.17.1",
    "posthog-js": "^1.256.2",
    react: "^18.3.1",
    "react-dom": "^18.3.1",
    "react-icons": "^4.12.0",
    "react-json-view": "^1.21.3",
    "react-markdown": "^10.1.0",
    "@tiptap/react": "^2.6.6",
    "@tiptap/starter-kit": "^2.6.6",
    "react-toastify": "^10.0.6",
    sonner: "^1.7.4",
    "svg-to-pdfkit": "^0.1.8",
    "tailwind-merge": "^2.6.0",
    uuid: "^11.1.0",
    "wavesurfer.js": "^7.9.9",
    xml2abc: "file:external-packages/xml2abc.tgz",
    zod: "^4.1.12",
    zustand: "^4.5.7"
  },
  devDependencies: {
    "@electron/notarize": "^3.0.1",
    "@electron/rebuild": "^3.7.2",
    "@faker-js/faker": "^10.0.0",
    "@playwright/test": "^1.53.2",
    "@tailwindcss/vite": "4.1.0",
    "@testing-library/dom": "^10.4.1",
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^15.0.7",
    "@testing-library/user-event": "^14.6.1",
    "@types/better-sqlite3": "^7.6.13",
    "@types/fabric": "^5.3.10",
    "@types/node": "^20.19.4",
    "@types/pdfkit": "^0.13.9",
    "@types/react": "^19.1.8",
    "@types/react-dom": "^19.1.6",
    "@types/sql.js": "^1.4.9",
    "@vitejs/plugin-react": "^4.6.0",
    "@vitest/coverage-v8": "^2.1.9",
    "@vitest/ui": "^3.2.4",
    canvas: "^3.2.0",
    "cross-env": "^10.0.0",
    dotenv: "^16.6.1",
    "drizzle-kit": "^0.31.4",
    electron: "^29.4.6",
    "electron-builder": "^26.0.12",
    "electron-builder-notarize": "^1.5.2",
    "electron-notarize": "^1.2.2",
    "electron-playwright-helpers": "^1.7.1",
    "fast-check": "^4.3.0",
    jsdom: "^24.1.3",
    "patch-package": "^8.0.0",
    rimraf: "^5.0.10",
    "sql-formatter": "^15.6.6",
    "sql.js": "^1.13.0",
    tailwindcss: "4.1.0",
    tsx: "^4.19.2",
    typescript: "~5.3.3",
    vite: "^4.5.14",
    "vite-plugin-electron": "^0.15.6",
    "vite-plugin-electron-renderer": "^0.14.6",
    vitest: "^4.0.0"
  },
  engines: {
    node: "22"
  }
};

// vite.config.mts
import { sentryVitePlugin } from "file:///Users/trevorschachner/Documents/GitHub-Projects/OpenMarch/node_modules/.pnpm/@sentry+vite-plugin@3.5.0_encoding@0.1.13/node_modules/@sentry/vite-plugin/dist/esm/index.mjs";
import tailwindcss from "file:///Users/trevorschachner/Documents/GitHub-Projects/OpenMarch/node_modules/.pnpm/@tailwindcss+vite@4.1.0_vite@4.5.14_@types+node@20.19.15_lightningcss@1.30.1_/node_modules/@tailwindcss/vite/dist/index.mjs";
var __vite_injected_original_dirname = "/Users/trevorschachner/Documents/GitHub-Projects/OpenMarch/apps/desktop";
var vite_config_default = defineConfig(({ command }) => {
  rmSync("dist-electron", { recursive: true, force: true });
  const isServe = command === "serve";
  const isBuild = command === "build";
  const sourcemap = isServe || !!process.env.VSCODE_DEBUG;
  return {
    resolve: {
      alias: {
        "@": path.join(__vite_injected_original_dirname, "src")
      },
      extensions: [".js", ".ts", ".jsx", ".tsx", ".json"]
    },
    plugins: [
      // Keep tailwindcss here for the main renderer process
      tailwindcss(),
      react(),
      sentryVitePlugin({
        authToken: process.env.SENTRY_AUTH_TOKEN,
        org: "openmarch-llc",
        project: "electron"
      }),
      electron([
        {
          // Main-Process entry file of the Electron App.
          entry: "electron/main/index.ts",
          onstart(options) {
            if (process.env.VSCODE_DEBUG) {
              console.log(
                /* For `.vscode/.debug.script.mjs` */
                "[startup] Electron App"
              );
            } else {
              options.startup();
            }
          },
          vite: {
            build: {
              sourcemap,
              minify: isBuild,
              outDir: "dist-electron/main",
              rollupOptions: {
                external: [
                  "better-sqlite3",
                  "electron/xml2abc-js/xml2abc.js",
                  "electron",
                  "node"
                ].concat(
                  Object.keys(
                    "dependencies" in package_default ? package_default.dependencies : {}
                  )
                )
              }
            }
          }
        },
        {
          entry: "electron/preload/index.ts",
          onstart(options) {
            options.reload();
          },
          vite: {
            build: {
              sourcemap: sourcemap ? "inline" : void 0,
              // #332
              minify: isBuild,
              outDir: "dist-electron/preload",
              rollupOptions: {
                external: Object.keys(
                  "dependencies" in package_default ? package_default.dependencies : {}
                )
              }
            }
          }
        }
      ]),
      // Use Node.js API in the Renderer-process
      renderer()
    ],
    server: process.env.VSCODE_DEBUG && (() => {
      const url = new URL(package_default.debug.env.VITE_DEV_SERVER_URL);
      return {
        host: url.hostname,
        port: +url.port
      };
    })(),
    clearScreen: false
  };
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcubXRzIiwgInBhY2thZ2UuanNvbiJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiY29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2Rpcm5hbWUgPSBcIi9Vc2Vycy90cmV2b3JzY2hhY2huZXIvRG9jdW1lbnRzL0dpdEh1Yi1Qcm9qZWN0cy9PcGVuTWFyY2gvYXBwcy9kZXNrdG9wXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvVXNlcnMvdHJldm9yc2NoYWNobmVyL0RvY3VtZW50cy9HaXRIdWItUHJvamVjdHMvT3Blbk1hcmNoL2FwcHMvZGVza3RvcC92aXRlLmNvbmZpZy5tdHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL1VzZXJzL3RyZXZvcnNjaGFjaG5lci9Eb2N1bWVudHMvR2l0SHViLVByb2plY3RzL09wZW5NYXJjaC9hcHBzL2Rlc2t0b3Avdml0ZS5jb25maWcubXRzXCI7aW1wb3J0IHsgcm1TeW5jIH0gZnJvbSBcIm5vZGU6ZnNcIjtcbmltcG9ydCBwYXRoIGZyb20gXCJub2RlOnBhdGhcIjtcbmltcG9ydCB7IGRlZmluZUNvbmZpZyB9IGZyb20gXCJ2aXRlXCI7XG5pbXBvcnQgcmVhY3QgZnJvbSBcIkB2aXRlanMvcGx1Z2luLXJlYWN0XCI7XG5pbXBvcnQgZWxlY3Ryb24gZnJvbSBcInZpdGUtcGx1Z2luLWVsZWN0cm9uXCI7XG5pbXBvcnQgcmVuZGVyZXIgZnJvbSBcInZpdGUtcGx1Z2luLWVsZWN0cm9uLXJlbmRlcmVyXCI7XG5pbXBvcnQgcGtnIGZyb20gXCIuL3BhY2thZ2UuanNvblwiO1xuaW1wb3J0IHsgc2VudHJ5Vml0ZVBsdWdpbiB9IGZyb20gXCJAc2VudHJ5L3ZpdGUtcGx1Z2luXCI7XG5pbXBvcnQgdGFpbHdpbmRjc3MgZnJvbSBcIkB0YWlsd2luZGNzcy92aXRlXCI7XG5cbi8vIGh0dHBzOi8vdml0ZWpzLmRldi9jb25maWcvXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoKHsgY29tbWFuZCB9KSA9PiB7XG4gICAgcm1TeW5jKFwiZGlzdC1lbGVjdHJvblwiLCB7IHJlY3Vyc2l2ZTogdHJ1ZSwgZm9yY2U6IHRydWUgfSk7XG5cbiAgICBjb25zdCBpc1NlcnZlID0gY29tbWFuZCA9PT0gXCJzZXJ2ZVwiO1xuICAgIGNvbnN0IGlzQnVpbGQgPSBjb21tYW5kID09PSBcImJ1aWxkXCI7XG4gICAgY29uc3Qgc291cmNlbWFwID0gaXNTZXJ2ZSB8fCAhIXByb2Nlc3MuZW52LlZTQ09ERV9ERUJVRztcblxuICAgIHJldHVybiB7XG4gICAgICAgIHJlc29sdmU6IHtcbiAgICAgICAgICAgIGFsaWFzOiB7XG4gICAgICAgICAgICAgICAgXCJAXCI6IHBhdGguam9pbihfX2Rpcm5hbWUsIFwic3JjXCIpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGV4dGVuc2lvbnM6IFtcIi5qc1wiLCBcIi50c1wiLCBcIi5qc3hcIiwgXCIudHN4XCIsIFwiLmpzb25cIl0sXG4gICAgICAgIH0sXG4gICAgICAgIHBsdWdpbnM6IFtcbiAgICAgICAgICAgIC8vIEtlZXAgdGFpbHdpbmRjc3MgaGVyZSBmb3IgdGhlIG1haW4gcmVuZGVyZXIgcHJvY2Vzc1xuICAgICAgICAgICAgdGFpbHdpbmRjc3MoKSxcbiAgICAgICAgICAgIHJlYWN0KCksXG4gICAgICAgICAgICBzZW50cnlWaXRlUGx1Z2luKHtcbiAgICAgICAgICAgICAgICBhdXRoVG9rZW46IHByb2Nlc3MuZW52LlNFTlRSWV9BVVRIX1RPS0VOLFxuICAgICAgICAgICAgICAgIG9yZzogXCJvcGVubWFyY2gtbGxjXCIsXG4gICAgICAgICAgICAgICAgcHJvamVjdDogXCJlbGVjdHJvblwiLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgICBlbGVjdHJvbihbXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAvLyBNYWluLVByb2Nlc3MgZW50cnkgZmlsZSBvZiB0aGUgRWxlY3Ryb24gQXBwLlxuICAgICAgICAgICAgICAgICAgICBlbnRyeTogXCJlbGVjdHJvbi9tYWluL2luZGV4LnRzXCIsXG4gICAgICAgICAgICAgICAgICAgIG9uc3RhcnQob3B0aW9ucykge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHByb2Nlc3MuZW52LlZTQ09ERV9ERUJVRykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvKiBGb3IgYC52c2NvZGUvLmRlYnVnLnNjcmlwdC5tanNgICovIFwiW3N0YXJ0dXBdIEVsZWN0cm9uIEFwcFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG9wdGlvbnMuc3RhcnR1cCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICB2aXRlOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBidWlsZDoge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNvdXJjZW1hcCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtaW5pZnk6IGlzQnVpbGQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgb3V0RGlyOiBcImRpc3QtZWxlY3Ryb24vbWFpblwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJvbGx1cE9wdGlvbnM6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZXh0ZXJuYWw6IFtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiYmV0dGVyLXNxbGl0ZTNcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZWxlY3Ryb24veG1sMmFiYy1qcy94bWwyYWJjLmpzXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImVsZWN0cm9uXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcIm5vZGVcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXS5jb25jYXQoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBPYmplY3Qua2V5cyhcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImRlcGVuZGVuY2llc1wiIGluIHBrZ1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA/IHBrZy5kZXBlbmRlbmNpZXNcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgOiB7fSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIGVudHJ5OiBcImVsZWN0cm9uL3ByZWxvYWQvaW5kZXgudHNcIixcbiAgICAgICAgICAgICAgICAgICAgb25zdGFydChvcHRpb25zKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBOb3RpZnkgdGhlIFJlbmRlcmVyLVByb2Nlc3MgdG8gcmVsb2FkIHRoZSBwYWdlIHdoZW4gdGhlIFByZWxvYWQtU2NyaXB0cyBidWlsZCBpcyBjb21wbGV0ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGluc3RlYWQgb2YgcmVzdGFydGluZyB0aGUgZW50aXJlIEVsZWN0cm9uIEFwcC5cbiAgICAgICAgICAgICAgICAgICAgICAgIG9wdGlvbnMucmVsb2FkKCk7XG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIHZpdGU6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJ1aWxkOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc291cmNlbWFwOiBzb3VyY2VtYXAgPyBcImlubGluZVwiIDogdW5kZWZpbmVkLCAvLyAjMzMyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbWluaWZ5OiBpc0J1aWxkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG91dERpcjogXCJkaXN0LWVsZWN0cm9uL3ByZWxvYWRcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByb2xsdXBPcHRpb25zOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4dGVybmFsOiBPYmplY3Qua2V5cyhcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZGVwZW5kZW5jaWVzXCIgaW4gcGtnXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPyBwa2cuZGVwZW5kZW5jaWVzXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgOiB7fSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgXSksXG4gICAgICAgICAgICAvLyBVc2UgTm9kZS5qcyBBUEkgaW4gdGhlIFJlbmRlcmVyLXByb2Nlc3NcbiAgICAgICAgICAgIHJlbmRlcmVyKCksXG4gICAgICAgIF0sXG4gICAgICAgIHNlcnZlcjpcbiAgICAgICAgICAgIHByb2Nlc3MuZW52LlZTQ09ERV9ERUJVRyAmJlxuICAgICAgICAgICAgKCgpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCB1cmwgPSBuZXcgVVJMKHBrZy5kZWJ1Zy5lbnYuVklURV9ERVZfU0VSVkVSX1VSTCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgaG9zdDogdXJsLmhvc3RuYW1lLFxuICAgICAgICAgICAgICAgICAgICBwb3J0OiArdXJsLnBvcnQsXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH0pKCksXG4gICAgICAgIGNsZWFyU2NyZWVuOiBmYWxzZSxcbiAgICB9O1xufSk7XG4iLCAie1xuICAgIFwibmFtZVwiOiBcIkBvcGVubWFyY2gvZGVza3RvcFwiLFxuICAgIFwicHJvZHVjdE5hbWVcIjogXCJPcGVuTWFyY2hcIixcbiAgICBcImRlc2NyaXB0aW9uXCI6IFwiRnJlZSBkcmlsbC13cml0aW5nIHNvZnR3YXJlIGZvciB0aGUgbWFyY2hpbmcgYXJ0c1wiLFxuICAgIFwidmVyc2lvblwiOiBcIjAuMC4xNFwiLFxuICAgIFwibWFpblwiOiBcImRpc3QtZWxlY3Ryb24vbWFpbi9pbmRleC5qc1wiLFxuICAgIFwiYXV0aG9yXCI6IFwiT3Blbk1hcmNoIExMQ1wiLFxuICAgIFwibGljZW5zZVwiOiBcIkFHUEwtMy4wXCIsXG4gICAgXCJwcml2YXRlXCI6IHRydWUsXG4gICAgXCJkZWJ1Z1wiOiB7XG4gICAgICAgIFwiZW52XCI6IHtcbiAgICAgICAgICAgIFwiVklURV9ERVZfU0VSVkVSX1VSTFwiOiBcImh0dHA6Ly8xMjcuMC4wLjE6Nzc3Ny9cIlxuICAgICAgICB9XG4gICAgfSxcbiAgICBcInJlcG9zaXRvcnlcIjoge1xuICAgICAgICBcInR5cGVcIjogXCJnaXRcIixcbiAgICAgICAgXCJ1cmxcIjogXCJodHRwczovL2dpdGh1Yi5jb20vT3Blbk1hcmNoL09wZW5NYXJjaC5naXRcIlxuICAgIH0sXG4gICAgXCJzY3JpcHRzXCI6IHtcbiAgICAgICAgXCJkZXZcIjogXCJwbnBtIHJ1biBhcHBseS1zdHlsZXMgJiYgdml0ZVwiLFxuICAgICAgICBcImFwcDpwcmVwYXJlXCI6IFwiZWxlY3Ryb24tcmVidWlsZCAtZiAtdyBiZXR0ZXItc3FsaXRlM1wiLFxuICAgICAgICBcInBvc3RpbnN0YWxsXCI6IFwiZWxlY3Ryb24tYnVpbGRlciBpbnN0YWxsLWFwcC1kZXBzXCIsXG4gICAgICAgIFwiYnVpbGRcIjogXCJwbnBtIHJ1biBhcHBseS1zdHlsZXMgJiYgdHNjICYmIHZpdGUgYnVpbGRcIixcbiAgICAgICAgXCJidWlsZDplbGVjdHJvblwiOiBcInBucG0gcnVuIGFwcGx5LXN0eWxlcyAmJiB0c2MgJiYgdml0ZSBidWlsZCAmJiBlbGVjdHJvbi1idWlsZGVyIC0tZGlyXCIsXG4gICAgICAgIFwiY2xlYW5cIjogXCJyaW1yYWYgbm9kZV9tb2R1bGVzIGRpc3QtZWxlY3Ryb24gcmVsZWFzZVwiLFxuICAgICAgICBcImFwcGx5LXN0eWxlc1wiOiBcIm5vZGUgc3JjL3N0eWxlcy9hcHBseS10YWlsd2luZC12YXJzLmNqc1wiLFxuICAgICAgICBcImxpbnRcIjogXCJlc2xpbnQgLiAtLWZpeFwiLFxuICAgICAgICBcImZvcm1hdFwiOiBcInByZXR0aWVyIC0td3JpdGUgLlwiLFxuICAgICAgICBcInNwZWxsY2hlY2tcIjogXCJjc3BlbGwgJ3NyYy8qKicgJ2VsZWN0cm9uLyoqJyAnKi5tZCdcIixcbiAgICAgICAgXCJmaXhcIjogXCJwcmV0dGllciAtLXdyaXRlIC4gJiYgZXNsaW50IC4gLS1maXggJiYgY3NwZWxsICdzcmMvKionICdlbGVjdHJvbi8qKicgJyoubWQnXCIsXG4gICAgICAgIFwidGVzdFwiOiBcInZpdGVzdCBydW4gLS1zaWxlbnRcIixcbiAgICAgICAgXCJ0ZXN0Omhpc3RvcnlcIjogXCJWSVRFU1RfRU5BQkxFX0hJU1RPUlk9dHJ1ZSBWSVRFU1RfRU5BQkxFX1NRTEpTPXRydWUgdml0ZXN0IHJ1blwiLFxuICAgICAgICBcInRlc3Q6d2F0Y2hcIjogXCJ2aXRlc3RcIixcbiAgICAgICAgXCJ0ZXN0OnByZXBhcmVcIjogXCJwbnBtIHJlYnVpbGQgYmV0dGVyLXNxbGl0ZTNcIixcbiAgICAgICAgXCJ0ZXN0OmNvdmVyYWdlXCI6IFwicG5wbSB0ZXN0IC0tIC0tY292ZXJhZ2VcIixcbiAgICAgICAgXCJ0ZXN0OmNsZWFyQ2FjaGVcIjogXCJ2aXRlc3QgLS1jbGVhckNhY2hlXCIsXG4gICAgICAgIFwiZTJlXCI6IFwiY3Jvc3MtZW52IFZJVEVfUFVCTElDX1BMQVlXUklHSFRfU0VTU0lPTj10cnVlIHBsYXl3cmlnaHQgdGVzdFwiLFxuICAgICAgICBcImUyZTpjb2RlZ2VuXCI6IFwibm9kZSBlMmUvX2NvZGVnZW4ubWpzXCIsXG4gICAgICAgIFwibWlncmF0ZVwiOiBcImV4cG9ydCBEQVRBQkFTRV9VUkw9ZmlsZTplbGVjdHJvbi9kYXRhYmFzZS9taWdyYXRpb25zL19ibGFuay5kb3RzICYmIHBucG0gcmVidWlsZCBiZXR0ZXItc3FsaXRlMyAmJiBkcml6emxlLWtpdCBnZW5lcmF0ZSAmJiB0c3ggc2NyaXB0cy9jcmVhdGUtYmxhbmstZGIudHNcIlxuICAgIH0sXG4gICAgXCJkZXBlbmRlbmNpZXNcIjoge1xuICAgICAgICBcIkBmb250c291cmNlL2RtLW1vbm9cIjogXCJeNS4yLjZcIixcbiAgICAgICAgXCJAZm9udHNvdXJjZS9kbS1zYW5zXCI6IFwiXjUuMi42XCIsXG4gICAgICAgIFwiQG9wZW5tYXJjaC9jb3JlXCI6IFwid29ya3NwYWNlOipcIixcbiAgICAgICAgXCJAb3Blbm1hcmNoL21ldHJvbm9tZVwiOiBcIndvcmtzcGFjZToqXCIsXG4gICAgICAgIFwiQG9wZW5tYXJjaC9tdXNpY3htbC1wYXJzZXJcIjogXCJ3b3Jrc3BhY2U6KlwiLFxuICAgICAgICBcIkBvcGVubWFyY2gvcGF0aC11dGlsaXR5XCI6IFwid29ya3NwYWNlOipcIixcbiAgICAgICAgXCJAb3Blbm1hcmNoL3VpXCI6IFwid29ya3NwYWNlOipcIixcbiAgICAgICAgXCJAcGhvc3Bob3ItaWNvbnMvcmVhY3RcIjogXCJeMi4xLjEwXCIsXG4gICAgICAgIFwiQHJhZGl4LXVpL3JlYWN0LWFsZXJ0LWRpYWxvZ1wiOiBcIl4xLjEuMTRcIixcbiAgICAgICAgXCJAcmFkaXgtdWkvcmVhY3QtY2hlY2tib3hcIjogXCJeMS4zLjJcIixcbiAgICAgICAgXCJAcmFkaXgtdWkvcmVhY3QtY29sbGFwc2libGVcIjogXCJeMS4xLjExXCIsXG4gICAgICAgIFwiQHJhZGl4LXVpL3JlYWN0LWNvbnRleHQtbWVudVwiOiBcIl4yLjIuMTVcIixcbiAgICAgICAgXCJAcmFkaXgtdWkvcmVhY3QtZGlhbG9nXCI6IFwiXjEuMS4xNFwiLFxuICAgICAgICBcIkByYWRpeC11aS9yZWFjdC1kcm9wZG93bi1tZW51XCI6IFwiXjIuMS4xNVwiLFxuICAgICAgICBcIkByYWRpeC11aS9yZWFjdC1mb3JtXCI6IFwiXjAuMS43XCIsXG4gICAgICAgIFwiQHJhZGl4LXVpL3JlYWN0LXBvcG92ZXJcIjogXCJeMS4xLjE0XCIsXG4gICAgICAgIFwiQHJhZGl4LXVpL3JlYWN0LXJhZGlvLWdyb3VwXCI6IFwiXjEuMy43XCIsXG4gICAgICAgIFwiQHJhZGl4LXVpL3JlYWN0LXNlbGVjdFwiOiBcIl4yLjIuNVwiLFxuICAgICAgICBcIkByYWRpeC11aS9yZWFjdC1zd2l0Y2hcIjogXCJeMS4yLjVcIixcbiAgICAgICAgXCJAcmFkaXgtdWkvcmVhY3QtdGFic1wiOiBcIl4xLjEuMTJcIixcbiAgICAgICAgXCJAcmFkaXgtdWkvcmVhY3QtdG9nZ2xlLWdyb3VwXCI6IFwiXjEuMS4xMFwiLFxuICAgICAgICBcIkByYWRpeC11aS9yZWFjdC10b29sdGlwXCI6IFwiXjEuMi43XCIsXG4gICAgICAgIFwiQHNlbnRyeS9lbGVjdHJvblwiOiBcIl42LjguMFwiLFxuICAgICAgICBcIkBzZW50cnkvdml0ZS1wbHVnaW5cIjogXCJeMy41LjBcIixcbiAgICAgICAgXCJAdGFuc3RhY2svcmVhY3QtcXVlcnlcIjogXCJeNS44NC4xXCIsXG4gICAgICAgIFwiQHRhbnN0YWNrL3JlYWN0LXF1ZXJ5LWRldnRvb2xzXCI6IFwiXjUuODQuMlwiLFxuICAgICAgICBcIkB0b2xnZWUvZm9ybWF0LWljdVwiOiBcIl42LjIuNlwiLFxuICAgICAgICBcIkB0b2xnZWUvcmVhY3RcIjogXCJeNi4yLjZcIixcbiAgICAgICAgXCJAdWl3L3JlYWN0LWNvbG9yXCI6IFwiXjIuNi4wXCIsXG4gICAgICAgIFwiQHVpdy9yZWFjdC1jb2xvci1za2V0Y2hcIjogXCJeMi42LjBcIixcbiAgICAgICAgXCJAdWl3L3JlYWN0LWNvbG9yLXN3YXRjaFwiOiBcIl4yLjYuMFwiLFxuICAgICAgICBcImFkbS16aXBcIjogXCJeMC41LjE2XCIsXG4gICAgICAgIFwiYmV0dGVyLXNxbGl0ZTNcIjogXCJeOS42LjBcIixcbiAgICAgICAgXCJjbGFzcy12YXJpYW5jZS1hdXRob3JpdHlcIjogXCJeMC43LjFcIixcbiAgICAgICAgXCJjbHN4XCI6IFwiXjIuMS4xXCIsXG4gICAgICAgIFwiZHJpenpsZS1vcm1cIjogXCJeMC40My4xXCIsXG4gICAgICAgIFwiZWxlY3Ryb24tc3RvcmVcIjogXCJeOC4yLjBcIixcbiAgICAgICAgXCJlbGVjdHJvbi11cGRhdGVyXCI6IFwiXjYuNi4yXCIsXG4gICAgICAgIFwiZmFicmljXCI6IFwiXjUuNS4yXCIsXG4gICAgICAgIFwianF1ZXJ5XCI6IFwiXjMuNy4xXCIsXG4gICAgICAgIFwianN6aXBcIjogXCJeMy4xMC4xXCIsXG4gICAgICAgIFwibG9kYXNoXCI6IFwiXjQuMTcuMjFcIixcbiAgICAgICAgXCJuYW5cIjogXCJeMi4yMi4yXCIsXG4gICAgICAgIFwicGRma2l0XCI6IFwiXjAuMTcuMVwiLFxuICAgICAgICBcInBvc3Rob2ctanNcIjogXCJeMS4yNTYuMlwiLFxuICAgICAgICBcInJlYWN0XCI6IFwiXjE4LjMuMVwiLFxuICAgICAgICBcInJlYWN0LWRvbVwiOiBcIl4xOC4zLjFcIixcbiAgICAgICAgXCJyZWFjdC1pY29uc1wiOiBcIl40LjEyLjBcIixcbiAgICAgICAgXCJyZWFjdC1qc29uLXZpZXdcIjogXCJeMS4yMS4zXCIsXG4gICAgICAgIFwicmVhY3QtbWFya2Rvd25cIjogXCJeMTAuMS4wXCIsXG4gICAgICAgIFwiQHRpcHRhcC9yZWFjdFwiOiBcIl4yLjYuNlwiLFxuICAgICAgICBcIkB0aXB0YXAvc3RhcnRlci1raXRcIjogXCJeMi42LjZcIixcbiAgICAgICAgXCJyZWFjdC10b2FzdGlmeVwiOiBcIl4xMC4wLjZcIixcbiAgICAgICAgXCJzb25uZXJcIjogXCJeMS43LjRcIixcbiAgICAgICAgXCJzdmctdG8tcGRma2l0XCI6IFwiXjAuMS44XCIsXG4gICAgICAgIFwidGFpbHdpbmQtbWVyZ2VcIjogXCJeMi42LjBcIixcbiAgICAgICAgXCJ1dWlkXCI6IFwiXjExLjEuMFwiLFxuICAgICAgICBcIndhdmVzdXJmZXIuanNcIjogXCJeNy45LjlcIixcbiAgICAgICAgXCJ4bWwyYWJjXCI6IFwiZmlsZTpleHRlcm5hbC1wYWNrYWdlcy94bWwyYWJjLnRnelwiLFxuICAgICAgICBcInpvZFwiOiBcIl40LjEuMTJcIixcbiAgICAgICAgXCJ6dXN0YW5kXCI6IFwiXjQuNS43XCJcbiAgICB9LFxuICAgIFwiZGV2RGVwZW5kZW5jaWVzXCI6IHtcbiAgICAgICAgXCJAZWxlY3Ryb24vbm90YXJpemVcIjogXCJeMy4wLjFcIixcbiAgICAgICAgXCJAZWxlY3Ryb24vcmVidWlsZFwiOiBcIl4zLjcuMlwiLFxuICAgICAgICBcIkBmYWtlci1qcy9mYWtlclwiOiBcIl4xMC4wLjBcIixcbiAgICAgICAgXCJAcGxheXdyaWdodC90ZXN0XCI6IFwiXjEuNTMuMlwiLFxuICAgICAgICBcIkB0YWlsd2luZGNzcy92aXRlXCI6IFwiNC4xLjBcIixcbiAgICAgICAgXCJAdGVzdGluZy1saWJyYXJ5L2RvbVwiOiBcIl4xMC40LjFcIixcbiAgICAgICAgXCJAdGVzdGluZy1saWJyYXJ5L2plc3QtZG9tXCI6IFwiXjYuNi4zXCIsXG4gICAgICAgIFwiQHRlc3RpbmctbGlicmFyeS9yZWFjdFwiOiBcIl4xNS4wLjdcIixcbiAgICAgICAgXCJAdGVzdGluZy1saWJyYXJ5L3VzZXItZXZlbnRcIjogXCJeMTQuNi4xXCIsXG4gICAgICAgIFwiQHR5cGVzL2JldHRlci1zcWxpdGUzXCI6IFwiXjcuNi4xM1wiLFxuICAgICAgICBcIkB0eXBlcy9mYWJyaWNcIjogXCJeNS4zLjEwXCIsXG4gICAgICAgIFwiQHR5cGVzL25vZGVcIjogXCJeMjAuMTkuNFwiLFxuICAgICAgICBcIkB0eXBlcy9wZGZraXRcIjogXCJeMC4xMy45XCIsXG4gICAgICAgIFwiQHR5cGVzL3JlYWN0XCI6IFwiXjE5LjEuOFwiLFxuICAgICAgICBcIkB0eXBlcy9yZWFjdC1kb21cIjogXCJeMTkuMS42XCIsXG4gICAgICAgIFwiQHR5cGVzL3NxbC5qc1wiOiBcIl4xLjQuOVwiLFxuICAgICAgICBcIkB2aXRlanMvcGx1Z2luLXJlYWN0XCI6IFwiXjQuNi4wXCIsXG4gICAgICAgIFwiQHZpdGVzdC9jb3ZlcmFnZS12OFwiOiBcIl4yLjEuOVwiLFxuICAgICAgICBcIkB2aXRlc3QvdWlcIjogXCJeMy4yLjRcIixcbiAgICAgICAgXCJjYW52YXNcIjogXCJeMy4yLjBcIixcbiAgICAgICAgXCJjcm9zcy1lbnZcIjogXCJeMTAuMC4wXCIsXG4gICAgICAgIFwiZG90ZW52XCI6IFwiXjE2LjYuMVwiLFxuICAgICAgICBcImRyaXp6bGUta2l0XCI6IFwiXjAuMzEuNFwiLFxuICAgICAgICBcImVsZWN0cm9uXCI6IFwiXjI5LjQuNlwiLFxuICAgICAgICBcImVsZWN0cm9uLWJ1aWxkZXJcIjogXCJeMjYuMC4xMlwiLFxuICAgICAgICBcImVsZWN0cm9uLWJ1aWxkZXItbm90YXJpemVcIjogXCJeMS41LjJcIixcbiAgICAgICAgXCJlbGVjdHJvbi1ub3Rhcml6ZVwiOiBcIl4xLjIuMlwiLFxuICAgICAgICBcImVsZWN0cm9uLXBsYXl3cmlnaHQtaGVscGVyc1wiOiBcIl4xLjcuMVwiLFxuICAgICAgICBcImZhc3QtY2hlY2tcIjogXCJeNC4zLjBcIixcbiAgICAgICAgXCJqc2RvbVwiOiBcIl4yNC4xLjNcIixcbiAgICAgICAgXCJwYXRjaC1wYWNrYWdlXCI6IFwiXjguMC4wXCIsXG4gICAgICAgIFwicmltcmFmXCI6IFwiXjUuMC4xMFwiLFxuICAgICAgICBcInNxbC1mb3JtYXR0ZXJcIjogXCJeMTUuNi42XCIsXG4gICAgICAgIFwic3FsLmpzXCI6IFwiXjEuMTMuMFwiLFxuICAgICAgICBcInRhaWx3aW5kY3NzXCI6IFwiNC4xLjBcIixcbiAgICAgICAgXCJ0c3hcIjogXCJeNC4xOS4yXCIsXG4gICAgICAgIFwidHlwZXNjcmlwdFwiOiBcIn41LjMuM1wiLFxuICAgICAgICBcInZpdGVcIjogXCJeNC41LjE0XCIsXG4gICAgICAgIFwidml0ZS1wbHVnaW4tZWxlY3Ryb25cIjogXCJeMC4xNS42XCIsXG4gICAgICAgIFwidml0ZS1wbHVnaW4tZWxlY3Ryb24tcmVuZGVyZXJcIjogXCJeMC4xNC42XCIsXG4gICAgICAgIFwidml0ZXN0XCI6IFwiXjQuMC4wXCJcbiAgICB9LFxuICAgIFwiZW5naW5lc1wiOiB7XG4gICAgICAgIFwibm9kZVwiOiBcIjIyXCJcbiAgICB9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQXlZLFNBQVMsY0FBYztBQUNoYSxPQUFPLFVBQVU7QUFDakIsU0FBUyxvQkFBb0I7QUFDN0IsT0FBTyxXQUFXO0FBQ2xCLE9BQU8sY0FBYztBQUNyQixPQUFPLGNBQWM7OztBQ0xyQjtBQUFBLEVBQ0ksTUFBUTtBQUFBLEVBQ1IsYUFBZTtBQUFBLEVBQ2YsYUFBZTtBQUFBLEVBQ2YsU0FBVztBQUFBLEVBQ1gsTUFBUTtBQUFBLEVBQ1IsUUFBVTtBQUFBLEVBQ1YsU0FBVztBQUFBLEVBQ1gsU0FBVztBQUFBLEVBQ1gsT0FBUztBQUFBLElBQ0wsS0FBTztBQUFBLE1BQ0gscUJBQXVCO0FBQUEsSUFDM0I7QUFBQSxFQUNKO0FBQUEsRUFDQSxZQUFjO0FBQUEsSUFDVixNQUFRO0FBQUEsSUFD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
