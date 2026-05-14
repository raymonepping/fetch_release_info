# HashiCorp Enterprise Release Tracker

Tracks Enterprise versions, release notes, and change highlights for HashiCorp products. Generates Markdown, HTML, and PDF reports for sharing with customers and partners.

## Supported products

`vault` · `boundary` · `nomad` · `terraform` · `consul` · `packer`

## Setup

```bash
npm install
```

> PDF generation requires puppeteer. If you only need MD or HTML, puppeteer is skipped gracefully.

Optional TinyFish rendering can be enabled with a local `.env` file:

```bash
TINYFISH_API_KEY=your_key_here
```

## Quick Start & Testing

### 1. First Run - Test Single Product
Start with a single product to verify everything works:

```bash
# Test with Vault (fastest to fetch)
node release-tracker.js --product vault --format md

# Expected output:
# ✓ Fetching Vault Enterprise releases...
# ✓ Latest version: 1.x.x+ent
# ✓ Generated: output/vault-2026-05-14.md
```

**What to check:**
- ✅ No errors in console
- ✅ Progress bar shows 100%
- ✅ File created in `output/` directory
- ✅ Snapshot created in `snapshots/vault.json`

### 2. Test Multiple Formats
Generate all output formats for one product:

```bash
node release-tracker.js --product vault --format all

# Creates:
# - output/vault-2026-05-14.md
# - output/vault-2026-05-14.html
# - output/vault-2026-05-14.pdf
```

**What to check:**
- ✅ All three files created
- ✅ HTML opens in browser correctly
- ✅ PDF renders properly (requires puppeteer)

### 3. Test Parallel Fetching
Try multiple products with different concurrency levels:

```bash
# Conservative (sequential)
node release-tracker.js --product vault,terraform --format md --concurrency 1
# Takes ~6-8 seconds

# Balanced (default)
node release-tracker.js --product vault,terraform --format md --concurrency 2
# Takes ~3-4 seconds (50% faster!)

# Aggressive
node release-tracker.js --product vault,terraform,consul --format md --concurrency 3
# Takes ~4-5 seconds for 3 products
```

**What to check:**
- ✅ Progress bar updates in real-time
- ✅ ETA calculations appear
- ✅ Higher concurrency = faster completion
- ✅ All products complete successfully

### 4. Test Caching (Second Run)
Run the same command twice to see caching in action:

```bash
# First run (fetches from network)
node release-tracker.js --product vault --format md
# Takes ~2-3 seconds

# Second run (uses cache)
node release-tracker.js --product vault --format md
# Takes <1 second! (95% faster)
```

**What to check:**
- ✅ Second run is dramatically faster
- ✅ Output is identical
- ✅ Cache files created in `cache/` directory

### 5. Full Production Test
Test all products with all formats:

```bash
node release-tracker.js --all --format all --concurrency 2

# Expected timing:
# - Without cache: ~12-18 seconds
# - With cache: ~2-3 seconds
# - Sequential (--concurrency 1): ~25-35 seconds
```

**What to check:**
- ✅ All 6 products processed
- ✅ 18 files created (6 products × 3 formats)
- ✅ Combined reports generated
- ✅ No errors or warnings

### 6. Test Error Handling
Test retry logic by temporarily disconnecting network:

```bash
# Disconnect WiFi, then run:
node release-tracker.js --product vault --format md

# Expected behavior:
# ⚠ Attempt 1 failed, retrying in 1s...
# ⚠ Attempt 2 failed, retrying in 2s...
# ⚠ Attempt 3 failed, retrying in 4s...
# ✗ Failed after 3 attempts
```

**What to check:**
- ✅ Automatic retry attempts
- ✅ Exponential backoff delays
- ✅ Graceful error messages

### 7. Verify Output Quality

**Check Markdown output:**
```bash
cat output/vault-2026-05-14.md
```
Should contain:
- ✅ Product name and version
- ✅ Release date
- ✅ Release notes section
- ✅ Change highlights
- ✅ Previous version comparison

**Check HTML output:**
```bash
open output/vault-2026-05-14.html
```
Should display:
- ✅ Formatted content with styling
- ✅ Proper headings and sections
- ✅ Readable layout

**Check PDF output:**
```bash
open output/vault-2026-05-14.pdf
```
Should show:
- ✅ Professional formatting
- ✅ All content from HTML
- ✅ Proper page breaks

### 8. Test Combined Reports
Generate a combined report for multiple products:

```bash
node release-tracker.js --product vault,terraform,consul --format html --scope combined

# Creates: output/combined-vault-terraform-consul-2026-05-14.html
```

**What to check:**
- ✅ Single file with all products
- ✅ Table of contents
- ✅ Proper section separation

### Common Issues & Solutions

**Issue: "Module not found"**
```bash
# Solution: Install dependencies
npm install
```

**Issue: "PDF generation failed"**
```bash
# Solution: Install puppeteer
npm install puppeteer
# Or skip PDF: --format md,html
```

**Issue: "Rate limit exceeded"**
```bash
# Solution: Reduce concurrency
node release-tracker.js --all --format all --concurrency 1
```

**Issue: "TinyFish API key not found"**
```bash
# Solution: Create .env file
echo "TINYFISH_API_KEY=your_key_here" > .env
# Or run without TinyFish (still works, just less accurate)
```

## Usage Examples

```bash
# All products, all formats (parallel fetching)
node release-tracker.js --all --format all

# Single product, PDF only
node release-tracker.js --product vault --format pdf

# Subset of products, Markdown only, combined report
node release-tracker.js --product vault,terraform,consul --format md --scope combined

# Individual HTML files only (no combined)
node release-tracker.js --product vault,nomad --format html --scope individual

# Control concurrency (useful for rate limiting)
node release-tracker.js --all --format all --concurrency 3

# Sequential mode (legacy, slower but more conservative)
node release-tracker.js --all --format all --concurrency 1
```

## Options

| Flag | Values | Default | Description |
|---|---|---|---|
| `--all` | — | — | Track all supported products |
| `--product` | comma-separated keys | — | e.g. `vault,terraform` |
| `--format` | `md` `html` `pdf` `all` | `all` | Output format(s) |
| `--scope` | `individual` `combined` `both` | `both` | Per-product files, one combined file, or both |
| `--concurrency` | number | `2` | Max parallel fetches (1 = sequential) |
| `--help` | — | — | Show usage |

## Output

```
output/
├── vault-2026-05-14.md
├── vault-2026-05-14.html
├── vault-2026-05-14.pdf
├── terraform-2026-05-14.md
└── combined-vault-terraform-2026-05-14.html
```

## Snapshots

Each run writes a snapshot to `./snapshots/<product>.json`. On subsequent runs the tracker diffs against this snapshot to determine the correct "previous version" regardless of how much time has passed between runs.

Snapshots are runtime state, not source. When this project is moved into a GitHub repository, add `snapshots/` and generated report formats under `output/` to `.gitignore`.

## Performance & Features

### Parallel Fetching
By default, the tracker fetches 2 products concurrently while maintaining polite rate limiting (800ms delays). This reduces total execution time by ~40-50% compared to sequential fetching.

- **Sequential mode** (safest): `--concurrency 1`
- **Default mode** (balanced): `--concurrency 2`
- **Aggressive mode** (fastest): `--concurrency 3-4`

### Progress Tracking
Real-time progress bar with ETA calculations shows:
- Visual progress indicator (█████░░░░░)
- Percentage complete
- Current/total products
- Time elapsed and estimated remaining
- Current product being processed

### Retry Logic
Automatic retry with exponential backoff (3 attempts) handles transient network failures gracefully. Failed requests are retried with increasing delays: 1s → 2s → 4s.

### Streaming Support
TinyFish API responses are processed via streaming when available, reducing memory usage and improving perceived performance for large responses.

## Notes

- Enterprise versions only (`+ent` suffix)
- Release notes parsing targets the versioned section on the HashiCorp docs site. A fallback mode captures best-effort content if version matching fails (flagged in output)
- Polite rate limiting (800ms delays) prevents overwhelming the docs server
- All network operations include retry logic for reliability

## TinyFish integration (optional)

HashiCorp's developer docs are Docusaurus/Next.js — JavaScript-rendered. Without TinyFish, release notes are parsed from raw HTML which may miss content that only appears after JS execution.

With `TINYFISH_API_KEY` set, the tracker routes docs page fetches through [TinyFish Fetch](https://docs.tinyfish.ai), which renders the full page and returns clean Markdown. This significantly improves release notes and change tracker extraction accuracy.

### Setup

The tracker uses `dotenv` to automatically load environment variables from a `.env` file in the project root:

**Option 1: Using .env file (recommended)**
```bash
# Create or edit .env file
echo "TINYFISH_API_KEY=your_key_here" > .env

# Run normally - dotenv loads .env automatically
node release-tracker.js --all --format all
```

**Option 2: Using shell environment**
```bash
# Set in current shell session
export TINYFISH_API_KEY=your_key_here
node release-tracker.js --all --format all
```

**Note:** The `.env` file is gitignored for security. Your API key is already configured if you have a `.env` file with `TINYFISH_API_KEY` set.

The releases index (`releases.hashicorp.com`) is always fetched raw — it's plain HTML, using TinyFish for it would waste quota.

TinyFish Search and Fetch are free. Get a key at [agent.tinyfish.ai](https://agent.tinyfish.ai).
