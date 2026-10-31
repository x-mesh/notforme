import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("extension/manifest.json", "utf8"));
const archive = process.argv[2] || "dist/notforme-extension-" + manifest.version + ".zip";
assert.ok(existsSync(archive), "archive does not exist: " + archive);

const entries = execFileSync("unzip", ["-Z1", archive], { encoding: "utf8" })
  .trim()
  .split("\n")
  .filter(Boolean);
const required = [
  "manifest.json",
  "src/adapters.js",
  "src/background.js",
  "src/content.css",
  "src/content.js",
  "src/popup.html",
  "src/popup.js",
  "icons/icon-16.png",
  "icons/icon-32.png",
  "icons/icon-48.png",
  "icons/icon-128.png",
];
for (const entry of required) assert.ok(entries.includes(entry), "missing package entry: " + entry);
assert.ok(!entries.some((entry) => [".env", "node_modules/", "test/", "docs/"].some((prefix) => entry === prefix || entry.startsWith(prefix))));
assert.ok(!entries.some((entry) => entry.includes("..")), "package contains a parent path");

const packagedManifest = JSON.parse(execFileSync("unzip", ["-p", archive, "manifest.json"], { encoding: "utf8" }));
assert.equal(packagedManifest.manifest_version, 3);
assert.equal(packagedManifest.version, manifest.version);
assert.equal(packagedManifest.background.service_worker, "src/background.js");
console.log("package tests passed");
