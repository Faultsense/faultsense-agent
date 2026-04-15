# Faultsense Performance Benchmark Tool

Measures the page performance impact of the faultsense agent by running paired A/B sessions (with and without the agent injected) in real Chromium via Playwright.

## Quick Start

```bash
# Stress test: scaling curve across 50/200/1000 assertions
npm run benchmark:stress

# Benchmark our demo app (self-dogfooding)
npm run benchmark:demo

# A-vs-A baseline: validate measurement stability
npm run benchmark:ava
```

`benchmark:stress` is the right starting point — it runs a built-in React 19 stress harness with real `fs-*` instrumentation, so the agent actually has assertions to evaluate. Running against an arbitrary public URL requires the target page to already carry `fs-*` instrumentation, which is rare; the URL mode is kept as an escape hatch but isn't the intended entry point.

## Requirements

- Node.js 18+
- Playwright's Chromium browser (`npx playwright install chromium`)
- Agent build artifact (`npm run build:agent`)
- For stress mode: `cd tools/benchmark/stress && npm install`

## How It Works

1. Launches headless Chromium via Playwright
2. Runs **30 paired A-B measurements** per throttle profile (first pair discarded as warmup)
3. **Condition A** (baseline): page loaded with shared measurement instruments only
4. **Condition B** (treatment): page loaded with instruments + faultsense agent + `Faultsense.init()`
5. Each measurement: navigate to URL, wait for `load`, idle soak for 60s, collect metrics
6. Produces a Markdown + JSON report with statistics

Both conditions install identical measurement instruments (longtask observer, web-vitals) so paired differential cancels instrument overhead.

## Modes

### Stress mode

Runs a React 19 stress harness with configurable assertion density and background DOM churn to produce a scaling curve:

```bash
npm run benchmark:stress
```

Output: written to `docs/public/performance/stress.md` and `stress.json` when run inside the faultsense-mono checkout; otherwise falls back to `tools/benchmark/results/` relative to the package root. Set `FS_BENCH_OUTPUT_DIR=<path>` to write anywhere else.

### Demo mode

Boots `examples/todolist-htmx` locally and benchmarks it:

```bash
npm run benchmark:demo
```

Output: same fallback as stress mode — `docs/public/performance/current.md` + `current.json` in the monorepo, else `tools/benchmark/results/`, else whatever `FS_BENCH_OUTPUT_DIR` points at.

Demo mode includes both idle soak and active-state (scripted user interactions) benchmarks. The idle soak injects an at-rest scrub that removes all `fs-*` attributes, simulating a page without instrumentation.

### URL mode (escape hatch)

Kept as a capability but not the recommended entry point. Benchmarking an arbitrary public URL only produces meaningful deltas if that page already carries `fs-*` assertions — otherwise the agent sits idle and you're just measuring its bootstrap cost. Use `benchmark:stress` instead.

The stress matrix tests 6 configurations (50/200/1000 assertions x 0/100 churn mutations per second) across `unthrottled` and `cpu4x` throttle profiles. Assertions cycle through 8 archetypes:

| Archetype | Trigger | Assertion Type |
|-----------|---------|----------------|
| Click→Updated | click | `fs-assert-updated` with text-matches |
| Click→Added | click | `fs-assert-added` |
| Click→Removed | click | `fs-assert-removed` |
| Input→Visible | input | `fs-assert-visible` with value-matches |
| Submit→Conditional | submit | `fs-assert-added-success/error` with mutex |
| Mount→Visible | mount | `fs-assert-visible` with classlist |
| Invariant→Stable | invariant | `fs-assert-stable` |
| Click→OOB | click | `fs-assert-updated` with OOB chain |

MutationObserver callback timing is captured by wrapping the MO constructor before agent load and reporting P50/P95/P99 per configuration.

### A-vs-A baseline mode

Runs both conditions without the agent to validate measurement stability:

```bash
npm run benchmark:ava
```

All deltas should be within noise. If they're not, the measurement apparatus itself is introducing bias.

## What's Measured

### Core Web Vitals
- **LCP** (Largest Contentful Paint)
- **CLS** (Cumulative Layout Shift)
- **INP** (Interaction to Next Paint) — lab estimate only
- **FCP** (First Contentful Paint)
- **TTFB** (Time to First Byte)

### Idle Soak Metrics
- **JSHeapUsedSize delta** — heap growth during soak (after forced GC)
- **DOM node count** — via CDP `Memory.getDOMCounters`
- **Long task count and total ms** — via `PerformanceObserver`

### MutationObserver Callback Timing (stress mode)
- **P50/P95/P99 callback duration** — via performance.mark/measure wrapper

### Throttle Profiles
- **Unthrottled** — no CPU or network throttling
- **Slow 4G** — 562.5ms RTT, 1.4Mbps down, 675Kbps up
- **CPU 4x** — 4x CPU slowdown, no network throttling
- **Slow 4G + CPU 4x** — both combined

## Statistical Analysis

Each metric reports:
- **Median** with p95 and IQR for both conditions
- **Delta** (B - A)
- **95% CI** — Hodges-Lehmann confidence interval on the median delta
- **p-value** — Wilcoxon signed-rank test (two-tailed, non-parametric)
- **Significance** — derived from p-value: `significant` (p < 0.01), `measurable` (p < 0.05), `within noise` (p >= 0.05)

The Wilcoxon signed-rank test is appropriate for paired measurements with unknown distributions. With 29 usable pairs (default), it has sufficient power to detect small effects.

## Configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `FS_BENCH_MODE` | `url` | `url`, `demo`, `stress`, or `ava` |
| `FS_BENCH_URL` | (required in url mode) | Target URL |
| `FS_BENCH_PORT` | `3099` | Demo server port |
| `FS_BENCH_PAIRS` | `30` (benchmark) / `15` (stress) | Pairs to collect (includes 1 warmup) |
| `FS_BENCH_SOAK_MS` | `60000` (benchmark) / `30000` (stress) | Idle soak duration (ms) |
| `FS_BENCH_DEBUG` | unset | Set to `1` for progress logging |

## CI Usage

The tool refuses to run in CI by default — shared-runner numbers are not meaningful for procurement. To override:

```bash
npm run benchmark -- --allow-ci https://example.com
```

Reports generated with `--allow-ci` are tagged with `[SHARED-RUNNER-SMOKE]` in the headline.

## Troubleshooting

### "Agent bundle not found"
Run `npm run build:agent` before benchmarking.

### "Faultsense agent was not detected after injection"
The target page's Content-Security-Policy may be blocking the injected script. Try a different URL without strict CSP, or check the page's CSP headers.

### Noisy results
- Run on a quiet machine (close other apps, disable background sync)
- Ensure the machine is plugged in (battery saver throttles CPU)
- Check the IQR column — high IQR indicates environmental noise
- Run `npm run benchmark:ava` to validate the measurement apparatus

## Privacy Note

When benchmarking a URL you don't own, the JSON output may contain tracker URLs, third-party script URLs, and resolved IP addresses from the profiler output. Review the JSON before publishing.
