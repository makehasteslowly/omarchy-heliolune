// Every string key the code names exists in i18n/en.json. Run: node tests/strings.mjs
// Catches keys named directly (strings.t("x.y")) and keys passed around as
// quoted names ("solar.goldenHourPm") that are looked up later.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const en = JSON.parse(fs.readFileSync(path.join(root, "i18n", "en.json"), "utf8"));
const src = fs.readFileSync(path.join(root, "BarWidget.qml"), "utf8") + "\n" + fs.readFileSync(path.join(root, "Model.js"), "utf8");
const prefixes = [...new Set(Object.keys(en).map(k => k.split(".")[0]))];
const re = new RegExp('"((?:' + prefixes.join("|") + ')\\.[A-Za-z0-9_.]+)"', "g");
const named = new Set();
for (const m of src.matchAll(re)) if (!m[1].endsWith(".")) named.add(m[1]);
const missing = [...named].filter(k => !(k in en));
if (missing.length) { console.log("Missing strings: " + missing.join(", ")); process.exit(1); }
console.log(`Strings: ${named.size} named keys, all present`);
