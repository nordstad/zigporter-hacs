import { playwrightLauncher } from "@web/test-runner-playwright";

function rewriteCdnImports() {
  return {
    name: "rewrite-cdn-imports",
    transformImport({ source }) {
      if (source === "https://cdn.jsdelivr.net/npm/lit@3/+esm") {
        return "/node_modules/lit/index.js";
      }
      if (
        source ===
        "https://cdn.jsdelivr.net/npm/lit@3/directives/unsafe-html.js/+esm"
      ) {
        return "/node_modules/lit/directives/unsafe-html.js";
      }
    },
  };
}

export default {
  files: "tests/js/**/*.test.js",
  nodeResolve: true,
  browsers: [
    playwrightLauncher({ product: "chromium" }),
    playwrightLauncher({ product: "firefox" }),
  ],
  plugins: [rewriteCdnImports()],
  coverage: true,
  coverageConfig: {
    include: ["custom_components/zigporter/static/**/*.js"],
    threshold: { statements: 100, branches: 100, functions: 100, lines: 100 },
  },
};
