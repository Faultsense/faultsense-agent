#!/usr/bin/env node
// Build entry for @faultsense/agent and its collector siblings.
//
// Produces three sibling npm packages from a single TypeScript source
// tree:
//
//   @faultsense/agent              ← packages/agent
//   @faultsense/panel-collector    ← packages/agent/collectors/panel
//   @faultsense/console-collector  ← packages/agent/collectors/console
//
// Each package ships three target classes:
//
//   dist/esm/{index,auto}.js       — ESM, unminified, tree-shakable
//   dist/cjs/{index,auto}.cjs      — CJS, unminified (Jest / legacy Node)
//   dist/iife/faultsense-*.min.js  — minified IIFE (CDN + script-tag)
//
// Declaration files (.d.ts / .d.cts) are emitted by a separate tsc pass
// invoked after esbuild — esbuild does not generate types itself. The
// tsc pass is scoped via tsconfig.build.json so pre-existing type drift
// in unrelated files (resolvers/page.ts etc.) does not block the build.
//
// The ESM/CJS default entries are built from pure source files that do
// NOT touch window/document at module load — importing them in Node
// or SSR is safe. The IIFE bundles + the ./auto entries are built from
// -auto.ts files that DO self-install (attach to window.Faultsense,
// wire DOMContentLoaded, etc.). The tests/purity.test.ts smoke test
// locks in this purity contract for the default entries.
//
// package.json is the single source of truth for the version — both
// this script and vitest.config.ts read __FS_VERSION__ from it, so
// test and production bundles can never disagree.
//
// Usage:
//   node scripts/build.mjs          # build all three packages
//   node scripts/build.mjs all      # same as above
//   node scripts/build.mjs agent    # @faultsense/agent only
//   node scripts/build.mjs panel    # @faultsense/panel-collector only
//   node scripts/build.mjs console  # @faultsense/console-collector only
//   node scripts/build.mjs types    # regenerate .d.ts files only

import { build } from "esbuild";
import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, "..");

const pkg = JSON.parse(
  await readFile(resolve(packageRoot, "package.json"), "utf8"),
);
const VERSION = pkg.version;
const LICENSE = pkg.license;

const banner = (label) =>
  `/*! Faultsense ${label} v${VERSION} | ${LICENSE} | https://faultsense.com */`;

const defines = {
  __FS_VERSION__: JSON.stringify(VERSION),
};

// --- Package descriptors -----------------------------------------------
//
// Each descriptor names the source entry pair (pure + auto), the dist
// root (relative to packageRoot) where ESM/CJS/IIFE go, the IIFE output
// filename, and a human label for banner comments. The agent is rooted
// at dist/; the collector sub-packages are rooted at their sibling
// directories under collectors/. The single build script populates all
// three from one pass.

const packages = {
  agent: {
    label: "agent",
    distRoot: "dist",
    pureEntry: "src/index.ts",
    autoEntry: "src/auto.ts",
    iifeFilename: "faultsense-agent.min.js",
  },
  panel: {
    label: "panel collector",
    distRoot: "collectors/panel/dist",
    pureEntry: "src/collectors/panel.ts",
    autoEntry: "src/collectors/panel-auto.ts",
    iifeFilename: "faultsense-panel.min.js",
  },
  console: {
    label: "console collector",
    distRoot: "collectors/console/dist",
    pureEntry: "src/collectors/console.ts",
    autoEntry: "src/collectors/console-auto.ts",
    iifeFilename: "faultsense-console.min.js",
  },
};

// --- ESM + CJS + IIFE builders (per package) ---------------------------

async function buildPackageESM(name) {
  const { label, distRoot, pureEntry, autoEntry } = packages[name];
  const entries = [
    { name: "index", entry: pureEntry },
    { name: "auto", entry: autoEntry },
  ];
  for (const { name: entryName, entry } of entries) {
    const outfile = `${distRoot}/esm/${entryName}.js`;
    await build({
      entryPoints: [resolve(packageRoot, entry)],
      bundle: true,
      target: "es2022",
      format: "esm",
      minify: false,
      outfile: resolve(packageRoot, outfile),
      define: defines,
      banner: { js: banner(`${label} (esm/${entryName})`) },
      legalComments: "inline",
      // Collector sub-packages peer-depend on @faultsense/agent — mark
      // the agent source imports as external so the collector bundles
      // don't ship their own copy of the agent runtime.
      external: name === "agent" ? [] : ["@faultsense/agent"],
    });
    console.log(`built ${outfile} (v${VERSION})`);
  }
}

async function buildPackageCJS(name) {
  const { label, distRoot, pureEntry, autoEntry } = packages[name];
  const entries = [
    { name: "index", entry: pureEntry },
    { name: "auto", entry: autoEntry },
  ];
  for (const { name: entryName, entry } of entries) {
    const outfile = `${distRoot}/cjs/${entryName}.cjs`;
    await build({
      entryPoints: [resolve(packageRoot, entry)],
      bundle: true,
      target: "es2022",
      platform: "node",
      format: "cjs",
      minify: false,
      outfile: resolve(packageRoot, outfile),
      define: defines,
      banner: { js: banner(`${label} (cjs/${entryName})`) },
      legalComments: "inline",
      external: name === "agent" ? [] : ["@faultsense/agent"],
    });
    console.log(`built ${outfile} (v${VERSION})`);
  }
}

async function buildPackageIIFE(name) {
  const { label, distRoot, autoEntry, iifeFilename } = packages[name];
  const outfile = `${distRoot}/iife/${iifeFilename}`;
  await build({
    entryPoints: [resolve(packageRoot, autoEntry)],
    bundle: true,
    target: "es2022",
    format: "iife",
    minify: true,
    outfile: resolve(packageRoot, outfile),
    define: defines,
    banner: { js: banner(label) },
    legalComments: "inline",
  });
  console.log(`built ${outfile} (v${VERSION})`);
}

// --- Type declarations (.d.ts / .d.cts) --------------------------------
//
// tsc emits into packages/agent/dist/esm/ with the rootDir set to src/.
// The emitted tree mirrors the source tree — src/index.ts becomes
// dist/esm/index.ts, src/collectors/panel.ts becomes
// dist/esm/collectors/panel.d.ts, and so on. After the tsc pass we
// relocate each collector's .d.ts files into its sub-package's dist
// directory so the per-package exports maps resolve correctly.

async function buildTypes() {
  const tsconfigBuild = resolve(packageRoot, "tsconfig.build.json");
  const result = spawnSync(
    "npx",
    ["tsc", "--project", tsconfigBuild],
    { cwd: packageRoot, stdio: "inherit" },
  );
  if (result.status !== 0) {
    throw new Error(`tsc type emit failed (exit ${result.status})`);
  }

  // Agent: dist/esm/index.d.ts and dist/esm/auto.d.ts are already where
  // the package.json exports map expects them. Copy to .d.cts alongside
  // the CJS output.
  const agentEntries = ["index", "auto"];
  for (const entry of agentEntries) {
    await cp(
      resolve(packageRoot, `dist/esm/${entry}.d.ts`),
      resolve(packageRoot, `dist/cjs/${entry}.d.cts`),
    );
  }

  // Collector sub-packages: tsc emits their .d.ts into
  // dist/esm/collectors/{name}.d.ts and collectors/{name}-auto.d.ts
  // (following rootDir = src). Relocate + rename to each sub-package's
  // dist/esm/ (as index.d.ts + auto.d.ts) and dist/cjs/ (as .d.cts).
  const collectorNames = ["panel", "console"];
  for (const name of collectorNames) {
    const distRoot = packages[name].distRoot;
    const emittedIndex = `dist/esm/collectors/${name}.d.ts`;
    const emittedAuto = `dist/esm/collectors/${name}-auto.d.ts`;

    await mkdir(resolve(packageRoot, `${distRoot}/esm`), { recursive: true });
    await mkdir(resolve(packageRoot, `${distRoot}/cjs`), { recursive: true });

    await cp(
      resolve(packageRoot, emittedIndex),
      resolve(packageRoot, `${distRoot}/esm/index.d.ts`),
    );
    await cp(
      resolve(packageRoot, emittedAuto),
      resolve(packageRoot, `${distRoot}/esm/auto.d.ts`),
    );
    await cp(
      resolve(packageRoot, emittedIndex),
      resolve(packageRoot, `${distRoot}/cjs/index.d.cts`),
    );
    await cp(
      resolve(packageRoot, emittedAuto),
      resolve(packageRoot, `${distRoot}/cjs/auto.d.cts`),
    );
  }

  console.log("built dist/esm/*.d.ts + dist/cjs/*.d.cts for agent + collectors");
}

// --- Orchestration -----------------------------------------------------

async function cleanDist() {
  // Remove stale outputs from prior builds (both the agent's dist/ and
  // each collector sub-package's dist/) so old files don't linger and
  // accidentally get shipped in a tarball.
  await rm(resolve(packageRoot, "dist"), { recursive: true, force: true });
  for (const name of ["panel", "console"]) {
    await rm(resolve(packageRoot, packages[name].distRoot), {
      recursive: true,
      force: true,
    });
  }
}

async function buildPackage(name) {
  await buildPackageESM(name);
  await buildPackageCJS(name);
  await buildPackageIIFE(name);
}

async function buildAll() {
  await cleanDist();
  // Build all esbuild outputs first, then emit types in one tsc pass
  // so tsc can see the complete picture and fan out to every package.
  for (const name of Object.keys(packages)) {
    await buildPackageESM(name);
    await buildPackageCJS(name);
  }
  await buildTypes();
  for (const name of Object.keys(packages)) {
    await buildPackageIIFE(name);
  }
}

const arg = process.argv[2] ?? "all";

if (arg === "all") {
  await buildAll();
} else if (packages[arg]) {
  await buildPackage(arg);
  // Types rebuild affects all packages — cheapest to just run the full
  // tsc pass rather than scope-filter it per package.
  await buildTypes();
} else if (arg === "types") {
  await buildTypes();
} else {
  console.error(
    `Unknown target: ${arg}. Expected one of: all, ${Object.keys(packages).join(", ")}, types`,
  );
  process.exit(1);
}
