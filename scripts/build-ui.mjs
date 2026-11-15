// Build the demo UI: inlines lib/screen.mjs (exports stripped, so it can run
// as a classic in-page module) and demo-cases.json into ui/template.html,
// and writes the identical file to public/index.html (served by server.mjs)
// and docs/index.html (standalone static demo for GitHub Pages).
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(root, "..");

const lib = await readFile(path.join(repo, "lib", "screen.mjs"), "utf8");
const libInline = lib.replace(/^export /gm, "");
const template = await readFile(path.join(repo, "ui", "template.html"), "utf8");
const demoCases = await readFile(path.join(repo, "demo-cases.json"), "utf8");

const html = template
  .replace("/*__SCREEN_LIB__*/", () => libInline)
  .replace("/*__DEMO_CASES__*/", () => `window.DEMO_CASES = ${demoCases};`);

await mkdir(path.join(repo, "public"), { recursive: true });
await mkdir(path.join(repo, "docs"), { recursive: true });
await writeFile(path.join(repo, "public", "index.html"), html);
await writeFile(path.join(repo, "docs", "index.html"), html);
console.log(`built public/index.html and docs/index.html (${html.length} bytes)`);
