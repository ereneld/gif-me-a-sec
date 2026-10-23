// Builds the Chrome Web Store upload: dist/gif-me-a-sec-<version>.zip
//
//   node scripts/build.mjs
//
// Only the files the extension needs at runtime go in the zip.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));

const INCLUDE = ["manifest.json", "LICENSE", "THIRD_PARTY_NOTICES.md", "icons", "popup", "panel", "src"];
const outDir = path.join(root, "dist");
const stage = path.join(outDir, "stage");
const zip = path.join(outDir, `gif-me-a-sec-${manifest.version}.zip`);

fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });
for (const item of INCLUDE) fs.cpSync(path.join(root, item), path.join(stage, item), { recursive: true });
fs.rmSync(zip, { force: true });
execFileSync("zip", ["-qr", "-X", zip, "."], { cwd: stage });
fs.rmSync(stage, { recursive: true, force: true });
console.log(`Built ${path.relative(root, zip)} (${(fs.statSync(zip).size / 1024).toFixed(0)} KB)`);
