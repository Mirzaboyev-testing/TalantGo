// Copies the ru/en notification templates (notif.<kind>[.<variant>]) from the app's locales into
// backend/app/assets/notif_templates.json, so the bot speaks the reader's language with the same words as the bell.
// Run after adding or changing a notif.* key:   npm run notif-templates
import { build } from "esbuild";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
// interface words of the bell itself, not notices
const UI = new Set(["empty", "empty_sub", "mark_all", "more", "read_all", "unread_n", "all_read", "just_now", "minutes_ago",
                    "today", "yesterday", "week", "earlier", "new"]);

const out = {};
const tmp = mkdtempSync(join(tmpdir(), "notif-"));
try {
  for (const lang of ["ru", "en"]) {
    const file = join(tmp, `${lang}.mjs`);
    await build({ entryPoints: [join(here, `../src/locales/${lang}.ts`)], bundle: true, format: "esm", platform: "node",
                  outfile: file, logLevel: "error" });
    const dict = (await import(pathToFileURL(file).href))[lang];
    out[lang] = Object.fromEntries(Object.entries(dict)
      .filter(([k]) => k.startsWith("notif.") && !UI.has(k.slice(6)))
      .sort(([a], [b]) => a.localeCompare(b)));
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
const target = join(here, "../../backend/app/assets/notif_templates.json");
writeFileSync(target, JSON.stringify(out, null, 1) + "\n");
console.log(`notif templates: ru ${Object.keys(out.ru).length}, en ${Object.keys(out.en).length} -> ${target}`);
