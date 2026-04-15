import { test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { runBenchmark, type RunOptions } from "./lib/measure";
import { generateMarkdown, generateJson, computeMetrics } from "./lib/report";
import { runCanonicalInteraction } from "./lib/interact";

const mode = process.env.FS_BENCH_MODE ?? "url";
const isDemo = mode === "demo";

function resolveUrl(): string {
  if (isDemo) {
    return `http://localhost:${process.env.FS_BENCH_PORT ?? "3099"}/login`;
  }
  const envUrl = process.env.FS_BENCH_URL;
  if (!envUrl) {
    throw new Error(
      "FS_BENCH_URL is required in url mode. Usage: FS_BENCH_URL=https://example.com npm run benchmark",
    );
  }
  return envUrl;
}

function resolveOutputDir(): string {
  // Explicit override always wins — used by CI and by anyone running
  // from a non-standard layout.
  if (process.env.FS_BENCH_OUTPUT_DIR) {
    const dir = path.resolve(process.env.FS_BENCH_OUTPUT_DIR);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }
  if (isDemo) {
    // Demo-mode results are the committed performance numbers. In the
    // faultsense-mono checkout they land at docs/public/performance/
    // four levels up from this file. In a standalone agent checkout
    // (e.g. the projected public faultsense-agent repo), that relative
    // path resolves outside the package and isn't meaningful — fall
    // back to a package-local ./results/ directory.
    const monorepoDir = path.resolve(__dirname, "../../../../docs/public/performance");
    if (fs.existsSync(path.dirname(monorepoDir))) {
      fs.mkdirSync(monorepoDir, { recursive: true });
      return monorepoDir;
    }
  }
  const dir = path.resolve(__dirname, "results");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

test("performance benchmark", async () => {
  const url = resolveUrl();
  const outputDir = resolveOutputDir();

  const allowCi = process.argv.includes("--allow-ci");

  const pairsCount = parseInt(process.env.FS_BENCH_PAIRS ?? "30", 10);
  const soakMs = parseInt(process.env.FS_BENCH_SOAK_MS ?? "60000", 10);

  const port = process.env.FS_BENCH_PORT ?? "3099";
  const options: RunOptions = {
    url,
    pairsCount,
    soakMs,
    allowCi,
    isDemo,
    // Demo mode: run active-state with scripted interactions + server reset
    ...(isDemo
      ? {
          interactFn: runCanonicalInteraction,
          resetUrl: `http://localhost:${port}/reset`,
        }
      : {}),
  };

  const modes = isDemo ? "idle + active" : "idle only";
  console.log(`\nBenchmark: ${isDemo ? "demo" : "url"} mode (${modes})`);
  console.log(`Target: ${url}`);
  console.log(`Pairs: ${options.pairsCount} (first discarded as warmup)`);
  console.log(`Soak: ${options.soakMs! / 1000}s per measurement`);
  console.log(`Profiles: unthrottled, slow4g\n`);

  const report = await runBenchmark(options);
  report.metrics = computeMetrics(report);

  // Write outputs
  const mdPath = isDemo
    ? path.resolve(outputDir, "current.md")
    : path.resolve(outputDir, "report.md");
  const jsonPath = isDemo
    ? path.resolve(outputDir, "current.json")
    : path.resolve(outputDir, "report.json");

  const markdown = generateMarkdown(report);
  const json = generateJson(report);

  fs.writeFileSync(mdPath, markdown, "utf-8");
  fs.writeFileSync(jsonPath, json, "utf-8");

  console.log(`\nReport written to:`);
  console.log(`  Markdown: ${mdPath}`);
  console.log(`  JSON:     ${jsonPath}`);

  if (report.status === "aborted") {
    console.log(`\nRun was aborted. Partial results saved.`);
    process.exitCode = 130;
  }
});
