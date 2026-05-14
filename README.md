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

## Usage

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

With `TINYFISH_API_KEY` set in your shell or in `.env`, the tracker routes docs page fetches through [TinyFish Fetch](https://docs.tinyfish.ai), which renders the full page and returns clean Markdown. This significantly improves release notes and change tracker extraction accuracy.

```bash
TINYFISH_API_KEY=your_key_here
node release-tracker.js --all --format all
```

The releases index (`releases.hashicorp.com`) is always fetched raw — it's plain HTML, using TinyFish for it would waste quota.

TinyFish Search and Fetch are free. Get a key at [agent.tinyfish.ai](https://agent.tinyfish.ai).
