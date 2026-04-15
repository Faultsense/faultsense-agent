#!/usr/bin/env node
// Build entry for the agent + collector bundles.
//
// Why this exists instead of straight esbuild CLI calls in package.json:
// the agent embeds its own version (banner comment + Faultsense.version
// runtime field) so a bundle pulled from a customer's page can be
// identified at a glance. The version comes from package.json — that
// file is the single source of truth for the release. Both the build
// and vitest read the same value via JSON.parse, so production and
// tests can never disagree.
//
// Usage:
//   node scripts/build.mjs            # build all targets
//   node scripts/build.mjs all        # same as above
//   node scripts/build.mjs agent      # build just the agent
//   node scripts/build.mjs console    # build just the console collector
//   node scripts/build.mjs panel      # build just the panel collector

import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, "..");

const pkg = JSON.parse(
  await readFile(resolve(packageRoot, "package.json"), "utf8"),
);
const VERSION = pkg.version;
const LICENSE = pkg.license;

const banner = (label) =>
  `/*! Faultsense ${label} v${VERSION} | ${LICENSE} | https://faultsense.com */`;

const targets = {
  agent: {
    label: "agent",
    entry: "src/index.ts",
    outfile: "dist/faultsense-agent.min.js",
  },
  console: {
    label: "console collector",
    entry: "src/collectors/console.ts",
    outfile: "dist/faultsense-console.min.js",
  },
  panel: {
    label: "panel collector",
    entry: "src/collectors/panel.ts",
    outfile: "dist/faultsense-panel.min.js",
  },
};

async function buildOne(name) {
  const { label, entry, outfile } = targets[name];
  await build({
    entryPoints: [resolve(packageRoot, entry)],
    bundle: true,
    target: "es2022",
    format: "iife",
    minify: true,
    outfile: resolve(packageRoot, outfile),
    define: {
      __FS_VERSION__: JSON.stringify(VERSION),
    },
    banner: { js: banner(label) },
    legalComments: "inline",
  });
  console.log(`built ${outfile} (v${VERSION})`);
}

const arg = process.argv[2] ?? "all";

if (arg === "all") {
  for (const name of Object.keys(targets)) {
    await buildOne(name);
  }
} else if (targets[arg]) {
  await buildOne(arg);
} else {
  console.error(
    `Unknown target: ${arg}. Expected one of: all, ${Object.keys(targets).join(", ")}`,
  );
  process.exit(1);
}
