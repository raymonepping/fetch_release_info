#!/usr/bin/env node
// release-tracker.js — CLI entrypoint
//
// Usage:
//   node release-tracker.js --all --format all
//   node release-tracker.js --product vault --format pdf
//   node release-tracker.js --product vault,terraform,consul --format md
//   node release-tracker.js --help

import path from "path";
import { ENTERPRISE_PRODUCTS, ALL_PRODUCTS } from "./config.js";
import { fetchProducts } from "./fetcher.js";
import { processSnapshots } from "./snapshot.js";
import { render } from "./renderer.js";

// ─── ANSI colours ────────────────────────────────────────────────────────────

const C = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  dim:    "\x1b[2m",
  blue:   "\x1b[34m",
  cyan:   "\x1b[36m",
  green:  "\x1b[32m",
  yellow: "\x1b[33m",
  red:    "\x1b[31m",
  gold:   "\x1b[33m",
};

const bold   = (s) => `${C.bold}${s}${C.reset}`;
const dim    = (s) => `${C.dim}${s}${C.reset}`;
const green  = (s) => `${C.green}${s}${C.reset}`;
const yellow = (s) => `${C.yellow}${s}${C.reset}`;
const red    = (s) => `${C.red}${s}${C.reset}`;
const cyan   = (s) => `${C.cyan}${s}${C.reset}`;
const gold   = (s) => `${C.gold}${s}${C.reset}`;

// ─── Help ────────────────────────────────────────────────────────────────────

function printHelp() {
  console.log(`
${bold("HashiCorp Enterprise Release Tracker")}
${dim("Fetches latest ENT versions, release notes, and change highlights")}

${bold("Usage:")}
  node release-tracker.js [options]

${bold("Options:")}
  ${cyan("--all")}                     Track all Enterprise products (vault, boundary, nomad, consul)
  ${cyan("--product")} <list>          Comma-separated product keys
                             Supported: ${ALL_PRODUCTS.join(", ")}
  ${cyan("--format")}  <format>        Output format: md | html | pdf | all  (default: all)
  ${cyan("--scope")}   <scope>         Output scope: individual | combined | both  (default: both)
  ${cyan("--concurrency")} <number>    Max parallel fetches (default: 2, use 1 for sequential)
  ${cyan("--help")}                    Show this help

${bold("Examples:")}
  node release-tracker.js --all --format all
  node release-tracker.js --product vault --format pdf
  node release-tracker.js --product vault,terraform --format md --scope combined
  node release-tracker.js --product vault,consul,nomad --format html
  node release-tracker.js --all --format all --concurrency 3

${bold("Output:")}
  Individual files:  ./output/<product>-<date>.<ext>
  Combined file:     ./output/combined-<products>-<date>.<ext>
  Snapshots:         ./snapshots/<product>.json  (runtime state)
`);
}

// ─── Argument parser ─────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const result = {
    products: [],
    all: false,
    format: "all",
    scope: "both",
    concurrency: 2,
    help: false,
    errors: [],
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      result.help = true;
      continue;
    }

    if (arg === "--all") {
      result.all = true;
      continue;
    }

    if (arg === "--product") {
      const val = args[++i];
      if (!val) { result.errors.push("--product requires a value"); continue; }
      const keys = val.split(",").map((k) => k.trim().toLowerCase());
      const invalid = keys.filter((k) => !ALL_PRODUCTS.includes(k));
      if (invalid.length) result.errors.push(`Unknown product(s): ${invalid.join(", ")}`);
      result.products.push(...keys.filter((k) => ALL_PRODUCTS.includes(k)));
      continue;
    }

    if (arg === "--format") {
      const val = args[++i];
      if (!val) { result.errors.push("--format requires a value"); continue; }
      const valid = ["md", "html", "pdf", "all"];
      if (!valid.includes(val)) {
        result.errors.push(`Invalid format "${val}". Choose: ${valid.join(", ")}`);
      } else {
        result.format = val;
      }
      continue;
    }

    if (arg === "--scope") {
      const val = args[++i];
      if (!val) { result.errors.push("--scope requires a value"); continue; }
      const valid = ["individual", "combined", "both"];
      if (!valid.includes(val)) {
        result.errors.push(`Invalid scope "${val}". Choose: ${valid.join(", ")}`);
      } else {
        result.scope = val;
      }
      continue;
    }

    if (arg === "--concurrency") {
      const val = args[++i];
      if (!val) { result.errors.push("--concurrency requires a value"); continue; }
      const num = parseInt(val, 10);
      if (isNaN(num) || num < 1 || num > 10) {
        result.errors.push(`Invalid concurrency "${val}". Must be between 1 and 10`);
      } else {
        result.concurrency = num;
      }
      continue;
    }

    result.errors.push(`Unknown argument: ${arg}`);
  }

  // Resolve product list
  if (result.all) {
    result.products = [...ENTERPRISE_PRODUCTS]; // Default to Enterprise products only
  }

  // Deduplicate
  result.products = [...new Set(result.products)];

  return result;
}

// ─── Banner ──────────────────────────────────────────────────────────────────

function printBanner() {
  console.log(`
${bold(gold("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"))}
  ${bold("HashiCorp Enterprise Release Tracker")}
  ${dim("Versions · Release Notes · Change Highlights")}
${bold(gold("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"))}
`);
}

// ─── Summary table ───────────────────────────────────────────────────────────

function printSummary(dataArray, writtenFiles) {
  console.log(`\n${bold("━━━ Results ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")}`);

  for (const d of dataArray) {
    const status = d.isFirstRun
      ? yellow("first run")
      : d.versionChanged
        ? green("updated")
        : dim("no change");

    const prev = d.reportedPrevious ?? "—";
    const latest = d.latest ?? red("fetch failed");

    console.log(
      `  ${bold(d.label.padEnd(12))}  ${dim(prev.padEnd(20))}→  ${cyan(latest.padEnd(20))}  [${status}]`
    );
  }

  console.log(`\n${bold("━━━ Files Written ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")}`);
  if (writtenFiles.length === 0) {
    console.log(`  ${yellow("No files written.")}`);
  } else {
    for (const f of writtenFiles) {
      console.log(`  ${green("✓")}  ${dim(path.relative(process.cwd(), f))}`);
    }
  }

  console.log(`\n${bold(gold("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"))}\n`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (args.errors.length) {
    for (const e of args.errors) console.error(red(`  Error: ${e}`));
    console.error(dim("  Run with --help for usage."));
    process.exit(1);
  }

  if (args.products.length === 0) {
    console.error(red("  Error: No products specified. Use --all or --product <list>."));
    console.error(dim("  Run with --help for usage."));
    process.exit(1);
  }

  printBanner();

  console.log(`${bold("Products:")}     ${args.products.join(", ")}`);
  console.log(`${bold("Format:")}       ${args.format}`);
  console.log(`${bold("Scope:")}        ${args.scope}`);
  console.log(`${bold("Concurrency:")}  ${args.concurrency} ${args.concurrency === 1 ? "(sequential)" : "(parallel)"}`);
  console.log();

  // ── Step 1: Fetch ──────────────────────────────────────────────────────────
  console.log(bold("[ 1/3 ] Fetching release data...\n"));
  let productData;
  try {
    productData = await fetchProducts(args.products, args.concurrency);
  } catch (err) {
    console.error(red(`\n  Fatal fetch error: ${err.message}`));
    process.exit(1);
  }

  // ── Step 2: Snapshot + diff ────────────────────────────────────────────────
  console.log(`\n${bold("[ 2/3 ] Processing snapshots...\n")}`);
  const enriched = processSnapshots(productData);

  // ── Step 3: Render ─────────────────────────────────────────────────────────
  console.log(`\n${bold("[ 3/3 ] Rendering output...\n")}`);
  let writtenFiles;
  try {
    writtenFiles = await render(enriched, args.format, args.scope);
  } catch (err) {
    console.error(red(`\n  Fatal render error: ${err.message}`));
    process.exit(1);
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  printSummary(enriched, writtenFiles);
}

main().catch((err) => {
  console.error(red(`\nUnhandled error: ${err.message}`));
  console.error(dim(err.stack));
  process.exit(1);
});
