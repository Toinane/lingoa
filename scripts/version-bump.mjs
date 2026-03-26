#!/usr/bin/env node
/**
 * version hook — syncs the version from package.json into:
 *   - src-tauri/tauri.conf.json
 *   - src-tauri/Cargo.toml
 *   - src-tauri/Cargo.lock (via cargo update)
 *
 * Run via `npm version patch|minor|major` (never call directly).
 */

import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";

const { version } = JSON.parse(readFileSync("package.json", "utf8"));

// tauri.conf.json
const tauriConf = readFileSync("src-tauri/tauri.conf.json", "utf8");
writeFileSync(
  "src-tauri/tauri.conf.json",
  tauriConf.replace(/"version"\s*:\s*"[^"]+"/, `"version": "${version}"`),
);

// Cargo.toml — only the first occurrence (the [package] block)
const cargo = readFileSync("src-tauri/Cargo.toml", "utf8");
writeFileSync(
  "src-tauri/Cargo.toml",
  cargo.replace(/^version\s*=\s*"[^"]+"/m, `version = "${version}"`),
);

// Refresh Cargo.lock with the new package version
execSync("cargo update --manifest-path src-tauri/Cargo.toml --package lingoa", { stdio: "inherit" });

console.log(`bumped to ${version}`);
