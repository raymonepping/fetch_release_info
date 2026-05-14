// renderer.js — output layer
// Generates Markdown, self-contained HTML, and PDF from enriched product data

import fs from "fs";
import path from "path";
import { Worker } from "worker_threads";
import { fileURLToPath } from "url";
import { OUTPUT_DIR, PRODUCTS } from "./config.js";
import {
  generateProductDiff,
  formatDiffMarkdown,
  formatDiffHtml,
  generateChangeSummary,
  diffStyles
} from "./diff.js";
import { readSnapshot } from "./snapshot.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function datestamp() {
  return new Date().toISOString().split("T")[0];
}

function formatVersion(v) {
  return v ?? "unknown";
}

function normalizeText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function markdownCell(value) {
  return normalizeText(value).replace(/\|/g, "\\|");
}

function markdownBullet(value) {
  const text = normalizeText(value);
  return text ? `- ${text}` : null;
}

function bullet(items) {
  if (!items || items.length === 0) return "_No items recorded._";
  const lines = items.map(markdownBullet).filter(Boolean);
  return lines.length ? lines.join("\n") : "_No items recorded._";
}

function htmlList(items) {
  if (!items || items.length === 0) return "<p><em>No items recorded.</em></p>";
  const lines = items
    .map(normalizeText)
    .filter(Boolean)
    .map((i) => `  <li>${escapeHtml(i)}</li>`);
  return lines.length
    ? `<ul>\n${lines.join("\n")}\n</ul>`
    : "<p><em>No items recorded.</em></p>";
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function statusBadge(data) {
  if (data.isFirstRun) return "🆕 First Run";
  if (data.versionChanged) return "🔼 Updated";
  return "✅ No Change";
}

function statusBadgeHtml(data) {
  if (data.isFirstRun) return `<span class="badge badge-new">First Run</span>`;
  if (data.versionChanged) return `<span class="badge badge-updated">Updated</span>`;
  return `<span class="badge badge-unchanged">No Change</span>`;
}

// ─── Markdown ────────────────────────────────────────────────────────────────

function productToMarkdown(data) {
  const date = datestamp();
  const fallbackNote = data.fallback
    ? "\n> _Note: Release notes could not be matched to this specific version. Content shown is best-effort from the release notes page._\n"
    : "";

  // Generate diff if previous snapshot exists
  const previousSnapshot = readSnapshot(data.product);
  const productDiff = generateProductDiff(data, previousSnapshot);
  
  let diffSection = '';
  if (productDiff.hasChanges && !productDiff.isFirstRun) {
    const summary = generateChangeSummary(productDiff);
    diffSection = `
## 📊 Changes Since Last Run

**Summary:** ${summary}

${formatDiffMarkdown(productDiff.whatsNew, "What's New")}

${formatDiffMarkdown(productDiff.whatsChanged, "What's Changed")}

${formatDiffMarkdown(productDiff.highlights, "Change Tracker Highlights")}

---

`;
  }

  return `# ${data.label} Enterprise — Release Update

**Generated:** ${date}
**Status:** ${statusBadge(data)}
${fallbackNote}
## Version

| | Version |
|---|---|
| Previous | \`${markdownCell(formatVersion(data.reportedPrevious))}\` |
| Latest | \`${markdownCell(formatVersion(data.latest))}\` |

${diffSection}${diffSection ? '' : `## What's New

${bullet(data.whatsNew)}

## What's Changed

${bullet(data.whatsChanged)}

## Change Tracker Highlights

${bullet(data.highlights)}

`}---
_Source: [Release Notes](${getConfig(data.product).releaseNotesUrl}) · [Change Tracker](${getConfig(data.product).changeTrackerUrl})_
`;
}

function combinedMarkdown(dataArray) {
  const date = datestamp();
  const header = `# HashiCorp Enterprise — Release Update\n\n**Generated:** ${date}\n\n---\n\n`;
  const sections = dataArray.map(productToMarkdown).join("\n\n---\n\n");
  return header + sections;
}

// ─── HTML ────────────────────────────────────────────────────────────────────

const HTML_STYLE = `
  :root {
    --blue-dark:    #1a2b4a;
    --blue-mid:     #1e3a5f;
    --blue-light:   #2d5986;
    --gold:         #c9a84c;
    --gold-light:   #f0d080;
    --text:         #1f2937;
    --text-muted:   #6b7280;
    --surface:      #f9fafb;
    --border:       #e5e7eb;
    --white:        #ffffff;
    --green:        #16a34a;
    --amber:        #d97706;
    --purple:       #7c3aed;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 14px;
    color: var(--text);
    background: var(--surface);
    padding: 2rem;
    line-height: 1.6;
  }

  .report-header {
    background: var(--blue-dark);
    color: var(--white);
    padding: 2rem 2.5rem;
    border-radius: 10px;
    margin-bottom: 2rem;
  }

  .report-header h1 {
    font-size: 1.6rem;
    font-weight: 700;
    color: var(--gold-light);
    margin-bottom: 0.25rem;
  }

  .report-header .meta {
    font-size: 0.85rem;
    color: #9ca3af;
  }

  .product-card {
    background: var(--white);
    border: 1px solid var(--border);
    border-radius: 10px;
    margin-bottom: 2rem;
    overflow: hidden;
    box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  }

  .product-card-header {
    background: var(--blue-mid);
    color: var(--white);
    padding: 1rem 1.5rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .product-card-header h2 {
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--gold-light);
  }

  .product-card-body {
    padding: 1.5rem;
  }

  .version-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 1.5rem;
    font-size: 0.9rem;
  }

  .version-table th {
    background: var(--blue-dark);
    color: var(--gold-light);
    padding: 0.5rem 1rem;
    text-align: left;
    font-weight: 600;
  }

  .version-table td {
    padding: 0.5rem 1rem;
    border-bottom: 1px solid var(--border);
  }

  .version-table tr:last-child td { border-bottom: none; }

  .version-table td code {
    background: #f3f4f6;
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
    font-family: "SF Mono", "Fira Code", monospace;
    font-size: 0.85rem;
    color: var(--blue-dark);
  }

  .section-title {
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--blue-dark);
    border-left: 3px solid var(--gold);
    padding-left: 0.6rem;
    margin: 1.25rem 0 0.75rem;
  }

  ul {
    padding-left: 1.4rem;
  }

  ul li {
    margin-bottom: 0.35rem;
    color: var(--text);
    line-height: 1.55;
  }

  p em { color: var(--text-muted); font-style: italic; }

  .badge {
    display: inline-block;
    padding: 0.2rem 0.65rem;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  .badge-new      { background: #dbeafe; color: #1d4ed8; }
  .badge-updated  { background: #dcfce7; color: #15803d; }
  .badge-unchanged { background: #f3f4f6; color: #6b7280; }

  .fallback-note {
    background: #fffbeb;
    border: 1px solid #fde68a;
    border-radius: 6px;
    padding: 0.6rem 1rem;
    font-size: 0.82rem;
    color: #92400e;
    margin-bottom: 1rem;
  }

  .source-links {
    margin-top: 1.25rem;
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .source-links a {
    color: var(--blue-light);
    text-decoration: none;
    margin-right: 1rem;
  }

  .source-links a:hover { text-decoration: underline; }

  .report-footer {
    text-align: center;
    margin-top: 2rem;
    font-size: 0.78rem;
    color: var(--text-muted);
  }

  @media print {
    body { background: white; padding: 0; }
    .product-card { break-inside: avoid; }
  }

  ${diffStyles}
`;

function productToHtmlCard(data) {
  const config = getConfig(data.product);
  const fallbackNote = data.fallback
    ? `<div class="fallback-note">⚠️ Release notes could not be matched to this specific version. Content shown is best-effort from the release notes page.</div>`
    : "";

  // Generate diff if previous snapshot exists
  const previousSnapshot = readSnapshot(data.product);
  const productDiff = generateProductDiff(data, previousSnapshot);
  
  let diffSection = '';
  if (productDiff.hasChanges && !productDiff.isFirstRun) {
    const summary = generateChangeSummary(productDiff);
    diffSection = `
      <div class="diff-summary">
        <strong>📊 Changes Since Last Run:</strong> ${escapeHtml(summary)}
      </div>
      ${formatDiffHtml(productDiff.whatsNew, "What's New")}
      ${formatDiffHtml(productDiff.whatsChanged, "What's Changed")}
      ${formatDiffHtml(productDiff.highlights, "Change Tracker Highlights")}
    `;
  }

  return `
  <div class="product-card">
    <div class="product-card-header">
      <h2>${escapeHtml(data.label)} Enterprise</h2>
      ${statusBadgeHtml(data)}
    </div>
    <div class="product-card-body">
      ${fallbackNote}

      <table class="version-table">
        <thead>
          <tr><th>Version</th><th>Tag</th></tr>
        </thead>
        <tbody>
          <tr><td>Previous</td><td><code>${escapeHtml(formatVersion(data.reportedPrevious))}</code></td></tr>
          <tr><td>Latest</td><td><code>${escapeHtml(formatVersion(data.latest))}</code></td></tr>
        </tbody>
      </table>

      ${diffSection || `
      <div class="section-title">What's New</div>
      ${htmlList(data.whatsNew)}

      <div class="section-title">What's Changed</div>
      ${htmlList(data.whatsChanged)}

      <div class="section-title">Change Tracker Highlights</div>
      ${htmlList(data.highlights)}
      `}

      <div class="source-links">
        <a href="${config.releaseNotesUrl}" target="_blank">Release Notes</a>
        <a href="${config.changeTrackerUrl}" target="_blank">Change Tracker</a>
        <a href="${config.releasesUrl}" target="_blank">All Releases</a>
      </div>
    </div>
  </div>`;
}

function toHTML(dataArray, title = "HashiCorp Enterprise — Release Update") {
  const date = datestamp();
  const cards = dataArray.map(productToHtmlCard).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <style>${HTML_STYLE}</style>
</head>
<body>
  <div class="report-header">
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">Generated: ${date}</div>
  </div>

  ${cards}

  <div class="report-footer">
    Generated on ${date} &mdash; HashiCorp Enterprise Release Tracker
  </div>
</body>
</html>`;
}

// ─── PDF (Worker Thread Implementation) ──────────────────────────────────────

/**
 * Generate PDF using worker thread for parallel processing
 */
async function toPDF(htmlContent, outputPath) {
  return new Promise((resolve) => {
    const workerPath = path.join(__dirname, 'pdf-worker.js');
    
    const worker = new Worker(workerPath, {
      workerData: { htmlContent, outputPath }
    });

    worker.on('message', (result) => {
      if (result.success) {
        resolve(true);
      } else {
        if (result.error === 'puppeteer not installed') {
          console.warn("  [warn] puppeteer not installed — skipping PDF generation");
          console.warn("         Run: npm install puppeteer");
        } else {
          console.warn(`  [warn] PDF generation failed: ${result.error}`);
        }
        resolve(false);
      }
    });

    worker.on('error', (error) => {
      console.warn(`  [warn] Worker error: ${error.message}`);
      resolve(false);
    });

    worker.on('exit', (code) => {
      if (code !== 0) {
        console.warn(`  [warn] Worker stopped with exit code ${code}`);
        resolve(false);
      }
    });
  });
}

/**
 * Generate multiple PDFs in parallel using worker pool
 */
async function toPDFParallel(pdfJobs) {
  if (pdfJobs.length === 0) return [];
  
  console.log(`  Generating ${pdfJobs.length} PDFs in parallel...`);
  const startTime = Date.now();
  
  const results = await Promise.all(
    pdfJobs.map(job => toPDF(job.htmlContent, job.outputPath))
  );
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const successful = results.filter(Boolean).length;
  console.log(`  ✓ Generated ${successful}/${pdfJobs.length} PDFs in ${elapsed}s`);
  
  return pdfJobs
    .filter((_, i) => results[i])
    .map(job => job.outputPath);
}

// ─── Config accessor (avoid circular import) ─────────────────────────────────

function getConfig(productKey) {
  return PRODUCTS[productKey] ?? {};
}

// ─── Main render entry point ──────────────────────────────────────────────────

/**
 * Renders output for one or more products in the requested format(s).
 *
 * @param {Array}  dataArray   — enriched product data from processSnapshots()
 * @param {string} format      — "md" | "html" | "pdf" | "all"
 * @param {string} scope       — "combined" | "individual" | "both"
 */
export async function render(dataArray, format = "all", scope = "both") {
  ensureDir(OUTPUT_DIR);
  const date = datestamp();
  const written = [];
  const pdfJobs = []; // Collect PDF jobs for parallel processing

  const formats = format === "all" ? ["md", "html", "pdf"] : [format];
  const scopes  = scope  === "both" ? ["individual", "combined"] : [scope];

  for (const fmt of formats) {
    for (const s of scopes) {
      if (s === "individual") {
        for (const data of dataArray) {
          const base = path.join(OUTPUT_DIR, `${data.product}-${date}`);

          if (fmt === "md") {
            const content = productToMarkdown(data);
            const filePath = `${base}.md`;
            fs.writeFileSync(filePath, content, "utf8");
            written.push(filePath);
          }

          if (fmt === "html") {
            const content = toHTML([data], `${data.label} Enterprise — Release Update`);
            const filePath = `${base}.html`;
            fs.writeFileSync(filePath, content, "utf8");
            written.push(filePath);
          }

          if (fmt === "pdf") {
            const htmlContent = toHTML([data], `${data.label} Enterprise — Release Update`);
            const filePath = `${base}.pdf`;
            pdfJobs.push({ htmlContent, outputPath: filePath });
          }
        }
      }

      if (s === "combined" && dataArray.length > 1) {
        const productList = dataArray.map((d) => d.product).join("-");
        const base = path.join(OUTPUT_DIR, `combined-${productList}-${date}`);

        if (fmt === "md") {
          const content = combinedMarkdown(dataArray);
          const filePath = `${base}.md`;
          fs.writeFileSync(filePath, content, "utf8");
          written.push(filePath);
        }

        if (fmt === "html") {
          const content = toHTML(dataArray);
          const filePath = `${base}.html`;
          fs.writeFileSync(filePath, content, "utf8");
          written.push(filePath);
        }

        if (fmt === "pdf") {
          const htmlContent = toHTML(dataArray);
          const filePath = `${base}.pdf`;
          pdfJobs.push({ htmlContent, outputPath: filePath });
        }
      }
    }
  }

  // Generate all PDFs in parallel using worker threads
  if (pdfJobs.length > 0) {
    const pdfPaths = await toPDFParallel(pdfJobs);
    written.push(...pdfPaths);
  }

  return written;
}
