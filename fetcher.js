// fetcher.js — data layer
// Scrapes releases.hashicorp.com for ENT versions
// Fetches and parses release notes + change tracker from developer.hashicorp.com
//
// TinyFish integration:
//   Set TINYFISH_API_KEY in your environment to use TinyFish Fetch for docs pages.
//   TinyFish renders JavaScript-heavy pages (Docusaurus/Next.js) fully before returning
//   clean Markdown — significantly improving release notes extraction accuracy.
//   Falls back to raw node-fetch + cheerio if no key is present.
//
//   TINYFISH_API_KEY=your_key_here

import "dotenv/config";
import fetch from "node-fetch";
import * as cheerio from "cheerio";
import semver from "semver";
import { PRODUCTS } from "./config.js";

const TINYFISH_API_KEY   = process.env.TINYFISH_API_KEY || null;
const TINYFISH_FETCH_URL = "https://api.fetch.tinyfish.ai";
const USE_TINYFISH       = Boolean(TINYFISH_API_KEY);
const CHANGE_TRACKER_LIMIT = 30;

// ─── Fetch mode banner ────────────────────────────────────────────────────────

export function logFetchMode() {
  if (USE_TINYFISH) {
    console.log("  [fetch mode] TinyFish - JS-rendered Markdown extraction");
  } else {
    console.log("  [fetch mode] raw node-fetch + cheerio  (set TINYFISH_API_KEY to upgrade)");
  }
  console.log();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const USER_AGENT = "Mozilla/5.0 (compatible; release-tracker/1.0; +https://github.com/raymonepping/release-tracker)";

const DEFAULT_HEADERS = {
  "User-Agent": USER_AGENT,
  Accept: "text/html,application/xhtml+xml",
};

function cleanText(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

function cleanVersionTag(version) {
  return String(version ?? "").replace(/\+ent$/, "").trim();
}

function semverCompareDesc(a, b) {
  const normalizedA = semver.valid(a) ?? semver.coerce(a)?.version;
  const normalizedB = semver.valid(b) ?? semver.coerce(b)?.version;

  if (!normalizedA && !normalizedB) return String(b).localeCompare(String(a));
  if (!normalizedA) return 1;
  if (!normalizedB) return -1;

  return semver.rcompare(normalizedA, normalizedB);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function limitHighlights(items, preferredVersion = null) {
  const cleanVersion = cleanVersionTag(preferredVersion);
  const seen = new Set();
  const cleaned = [];

  for (const item of items) {
    const text = cleanText(item);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    cleaned.push(text);
  }

  const versionMatches = cleanVersion
    ? cleaned.filter((item) => item.includes(cleanVersion))
    : [];

  return (versionMatches.length ? versionMatches : cleaned).slice(0, CHANGE_TRACKER_LIMIT);
}

// ─── Retry Logic ──────────────────────────────────────────────────────────────

/**
 * Retry a function with exponential backoff.
 * @param {Function} fn - Async function to retry
 * @param {number} maxRetries - Maximum number of retry attempts
 * @param {number} baseDelay - Base delay in milliseconds
 * @returns {Promise} Result of the function
 */
async function fetchWithRetry(fn, maxRetries = 3, baseDelay = 1000) {
  let lastError;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt);
        const jitter = Math.random() * 200; // Add jitter to prevent thundering herd
        const totalDelay = delay + jitter;
        console.warn(`  [retry] Attempt ${attempt + 1}/${maxRetries} failed, retrying in ${Math.round(totalDelay)}ms...`);
        await new Promise(resolve => setTimeout(resolve, totalDelay));
      }
    }
  }
  
  throw lastError;
}

// ─── Progress Tracking ────────────────────────────────────────────────────────

/**
 * Progress tracker for multi-product fetches.
 * Provides real-time feedback with ETA calculations.
 */
class ProgressTracker {
  constructor(total) {
    this.total = total;
    this.current = 0;
    this.startTime = Date.now();
    this.lastUpdate = 0;
  }

  update(productLabel, status = "processing") {
    this.current++;
    const now = Date.now();
    
    // Throttle updates to avoid console spam (max once per 100ms)
    if (now - this.lastUpdate < 100 && this.current < this.total) {
      return;
    }
    this.lastUpdate = now;
    
    const percent = Math.round((this.current / this.total) * 100);
    const elapsed = ((now - this.startTime) / 1000).toFixed(1);
    const avgTimePerItem = (now - this.startTime) / this.current;
    const remaining = this.total - this.current;
    const eta = remaining > 0 ? (avgTimePerItem * remaining / 1000).toFixed(1) : 0;
    
    // Build progress bar
    const barLength = 20;
    const filled = Math.round((this.current / this.total) * barLength);
    const bar = "█".repeat(filled) + "░".repeat(barLength - filled);
    
    const statusText = `[${bar}] ${percent}% | ${this.current}/${this.total} | ${productLabel} - ${status}`;
    const timeText = `${elapsed}s elapsed, ~${eta}s remaining`;
    
    // Clear line and write progress
    process.stdout.write(`\r\x1b[K  ${statusText} | ${timeText}`);
    
    if (this.current === this.total) {
      console.log(); // New line when complete
    }
  }

  complete() {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    console.log(`  ✓ Completed ${this.total} products in ${elapsed}s`);
  }
}

// ─── TinyFish fetch ───────────────────────────────────────────────────────────

/**
 * Fetches a URL via TinyFish Fetch API with streaming support.
 * Returns clean Markdown — full JS rendering, no nav/footer/ads noise.
 * Response: { markdown: string, raw: null }
 */
async function fetchViaTinyFish(url) {
  try {
    const res = await fetchWithTimeout(TINYFISH_FETCH_URL, {
      method: "POST",
      headers: {
        "X-API-Key": TINYFISH_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ urls: [url], output_format: "markdown" }),
    }, 30000);

    if (!res.ok) throw new Error(`TinyFish HTTP ${res.status}`);

    // Check if response supports streaming
    if (res.body && typeof res.body.getReader === 'function') {
      return await fetchViaTinyFishStreaming(res, url);
    }

    // Fallback to non-streaming
    const data = await res.json();
    const result = data?.results?.[0];
    if (!result?.markdown) throw new Error("TinyFish returned no markdown");

    return { markdown: result.markdown, raw: null };
  } catch (err) {
    console.warn(`  [warn] TinyFish fetch failed for ${url}: ${err.message}`);
    return null;
  }
}

/**
 * Handles streaming response from TinyFish API.
 * Processes chunks as they arrive for better performance.
 */
async function fetchViaTinyFishStreaming(response, url) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let markdown = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      
      // Try to parse complete JSON from buffer
      try {
        const data = JSON.parse(buffer);
        const result = data?.results?.[0];
        if (result?.markdown) {
          markdown = result.markdown;
          break; // Got what we need
        }
      } catch {
        // Not a complete JSON yet, continue reading
      }
    }

    // Final attempt to parse remaining buffer
    if (!markdown && buffer.trim()) {
      const data = JSON.parse(buffer);
      const result = data?.results?.[0];
      markdown = result?.markdown || null;
    }

    if (!markdown) {
      throw new Error("TinyFish streaming returned no markdown");
    }

    return { markdown, raw: null };
  } catch (err) {
    throw new Error(`Streaming parse error: ${err.message}`);
  }
}

// ─── Raw HTML fetch ───────────────────────────────────────────────────────────

/**
 * Fetches a URL with plain node-fetch.
 * Response: { markdown: null, raw: string }
 */
async function fetchRaw(url) {
  try {
    const res = await fetchWithTimeout(url, { headers: DEFAULT_HEADERS }, 15000);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return { markdown: null, raw: await res.text() };
  } catch (err) {
    console.warn(`  [warn] Could not fetch ${url}: ${err.message}`);
    return null;
  }
}

// ─── Unified fetch router ─────────────────────────────────────────────────────

/**
 * Routes to TinyFish or raw fetch depending on TINYFISH_API_KEY.
 * Returns: { markdown: string|null, raw: string|null } or null on failure.
 *
 * forceRaw: bypass TinyFish regardless of key — used for the plain releases
 * index which needs no JS rendering and should preserve quota.
 */
async function fetchPage(url, { forceRaw = false } = {}) {
  if (USE_TINYFISH && !forceRaw) {
    const rendered = await fetchViaTinyFish(url);
    if (rendered) return rendered;
    console.warn(`  [warn] Falling back to raw fetch for ${url}`);
  }
  return fetchRaw(url);
}

// ─── Markdown parser (TinyFish path) ─────────────────────────────────────────

/**
 * Parses clean Markdown returned by TinyFish into whatsNew / whatsChanged.
 *
 * Strategy:
 *   1. Find the heading line that contains the version number
 *   2. Walk lines below, classify sub-headings as "new" or "changed"
 *   3. Collect bullet points into the active bucket
 *   4. Stop at the next same-level or higher heading
 */
function parseMarkdownNotes(markdown, cleanVersion, rawVersion) {
  const lines = markdown.split("\n");
  const whatsNew = [];
  const whatsChanged = [];

  let inSection    = false;
  let sectionDepth = 0;
  let currentBucket = null;

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,4})\s+(.+)/);

    if (headingMatch) {
      const depth = headingMatch[1].length;
      const text  = headingMatch[2].trim().toLowerCase();

      if (!inSection) {
        if (text.includes(cleanVersion)) {
          inSection    = true;
          sectionDepth = depth;
          currentBucket = null;
        }
        continue;
      }

      // Inside version section — check depth
      if (depth <= sectionDepth) break; // end of this version block

      // Sub-heading: classify bucket
      if (text.includes("new") || text.includes("feature") || text.includes("addition")) {
        currentBucket = "new";
      } else if (text.includes("change") || text.includes("deprecat") || text.includes("fix") || text.includes("break") || text.includes("remov")) {
        currentBucket = "changed";
      } else {
        currentBucket = "new"; // unlabelled sub-sections default to new
      }
      continue;
    }

    if (!inSection) continue;

    // Bullet lines: - item or * item
    const bulletMatch = line.match(/^\s*[-*]\s+(.+)/);
    if (bulletMatch) {
      const text = cleanText(bulletMatch[1]);
      if (!text) continue;
      if (currentBucket === "changed") {
        whatsChanged.push(text);
      } else {
        whatsNew.push(text);
      }
    }
  }

  // Fallback: version heading found but no bullets — grab first 20 page-wide
  if (whatsNew.length === 0 && whatsChanged.length === 0) {
    let count = 0;
    for (const line of lines) {
      const bulletMatch = line.match(/^\s*[-*]\s+(.+)/);
      if (bulletMatch && count < 20) {
        whatsNew.push(cleanText(bulletMatch[1]));
        count++;
      }
    }
    return { whatsNew, whatsChanged, rawVersion, fallback: true };
  }

  return { whatsNew, whatsChanged, rawVersion };
}

// ─── Cheerio parsers (raw HTML path) ─────────────────────────────────────────

function parseSectionContent($, sectionEl, version) {
  const tagName = sectionEl.tagName;
  const whatsNew = [];
  const whatsChanged = [];
  let currentBucket = null;
  let el = $(sectionEl).next();

  while (el.length) {
    const tag = el.prop("tagName")?.toLowerCase();

    if (tag && ["h1", "h2", "h3"].includes(tag)) {
      const headingText = el.text().toLowerCase();
      if (headingText.includes("new") || headingText.includes("feature") || headingText.includes("addition")) {
        currentBucket = "new";
        el = el.next();
        continue;
      }
      if (headingText.includes("change") || headingText.includes("deprecat") || headingText.includes("fix") || headingText.includes("break")) {
        currentBucket = "changed";
        el = el.next();
        continue;
      }
      if (tag <= tagName) break;
    }

    if (tag === "ul" || tag === "ol") {
      el.find("li").each((_, li) => {
        const text = cleanText($(li).text());
        if (!text) return;
        if (currentBucket === "changed") {
          whatsChanged.push(text);
        } else {
          whatsNew.push(text);
        }
      });
    }

    if (tag === "p") {
      const text = cleanText(el.text());
      if (text) {
        if (currentBucket === "changed") {
          whatsChanged.push(text);
        } else {
          whatsNew.push(text);
        }
      }
    }

    el = el.next();
  }

  return { whatsNew, whatsChanged, rawVersion: version };
}

function parseFallbackContent($, productKey, version) {
  const whatsNew = [];
  const whatsChanged = [];

  $("ul li, ol li").each((i, el) => {
    if (i < 20) whatsNew.push(cleanText($(el).text()));
  });

  return { whatsNew, whatsChanged, rawVersion: version, fallback: true };
}

// ─── Version scraping ─────────────────────────────────────────────────────────

/**
 * Scrapes releases.hashicorp.com/<product>/ for ENT versions.
 * Always uses raw fetch — plain HTML index, no JS rendering needed.
 *
 * Returns: { latest: "1.19.4+ent", previous: "1.19.3+ent" } or nulls
 */
export async function getVersions(productKey) {
  const config = PRODUCTS[productKey];
  const page = await fetchPage(config.releasesUrl, { forceRaw: true });

  if (!page?.raw) return { latest: null, previous: null };

  const $ = cheerio.load(page.raw);
  const entVersions = [];

  $("a").each((_, el) => {
    const text = $(el).text().trim();
    const match = text.match(new RegExp(`^${productKey}_(.+\\+ent)$`, "i"));
    if (match) entVersions.push(match[1]);
  });

  if (entVersions.length === 0) return { latest: null, previous: null };

  entVersions.sort((a, b) => semverCompareDesc(cleanVersionTag(a), cleanVersionTag(b)));

  return {
    latest:   entVersions[0] || null,
    previous: entVersions[1] || null,
  };
}

// ─── Release notes parsing ────────────────────────────────────────────────────

/**
 * Fetches the release notes page and extracts structured content.
 * Routes to Markdown parser (TinyFish) or cheerio parser (raw) automatically.
 *
 * Returns: { whatsNew: string[], whatsChanged: string[], rawVersion: string }
 */
export async function getReleaseNotes(productKey, version) {
  const config = PRODUCTS[productKey];
  const cleanVersion = cleanVersionTag(version);

  const page = await fetchPage(config.releaseNotesUrl);
  if (!page) return { whatsNew: [], whatsChanged: [], rawVersion: version };

  // TinyFish path — clean Markdown
  if (page.markdown) {
    return parseMarkdownNotes(page.markdown, cleanVersion, version);
  }

  // Raw path — cheerio HTML
  const $ = cheerio.load(page.raw);
  let sectionEl = null;

  $("h1, h2, h3").each((_, el) => {
    const text = $(el).text().trim();
    if (text.includes(cleanVersion)) {
      sectionEl = el;
      return false;
    }
  });

  if (!sectionEl) return parseFallbackContent($, productKey, cleanVersion);

  return parseSectionContent($, sectionEl, cleanVersion);
}

// ─── Change tracker parsing ───────────────────────────────────────────────────

/**
 * Fetches the change-tracker page and returns notable entries.
 * Routes to Markdown parser (TinyFish) or cheerio parser (raw) automatically.
 *
 * Returns: { highlights: string[] }
 */
export async function getChangeTracker(productKey, version = null) {
  const config = PRODUCTS[productKey];
  const highlights = [];
  const cleanVersion = cleanVersionTag(version);

  const page = await fetchPage(config.changeTrackerUrl);
  if (!page) return { highlights };

  // TinyFish path — parse Markdown table rows and bullets
  if (page.markdown) {
    const lines = page.markdown.split("\n");
    for (const line of lines) {
      // Markdown table row: | col1 | col2 |
      const tableMatch = line.match(/^\|\s*(.+?)\s*\|\s*(.+?)\s*\|/);
      if (tableMatch && !line.includes("---")) {
        const col1 = tableMatch[1].trim();
        const col2 = tableMatch[2].trim();
        if (col1.toLowerCase() === "version" || col1.toLowerCase() === "change") continue;
        if (col1 && col2) {
          highlights.push(`${col1} - ${col2}`);
          continue;
        }
      }
      const bulletMatch = line.match(/^\s*[-*]\s+(.+)/);
      if (bulletMatch) highlights.push(bulletMatch[1]);
    }
    return { highlights: limitHighlights(highlights, cleanVersion) };
  }

  // Raw path — cheerio
  const $ = cheerio.load(page.raw);

  $("table tbody tr").each((_, row) => {
    const cells = $(row).find("td");
    if (cells.length >= 2) {
      const values = cells.toArray().map((cell) => cleanText($(cell).text()));
      if (cleanVersion && !values.some((value) => value.includes(cleanVersion))) return;

      const change = values[0];
      const detail = values.slice(1).filter(Boolean).join(" - ");
      if (change && detail) highlights.push(`${change} - ${detail}`);
    }
  });

  if (highlights.length === 0) {
    $("ul li, ol li").each((i, el) => {
      if (i < 15) {
        const text = cleanText($(el).text());
        if (text) highlights.push(text);
      }
    });
  }

  return { highlights: limitHighlights(highlights, cleanVersion) };
}

// ─── Aggregated fetch ─────────────────────────────────────────────────────────

/**
 * Full data fetch for a single product with retry logic.
 * Returns a structured object ready for snapshot + renderer.
 */
export async function fetchProduct(productKey, progressTracker = null) {
  const config = PRODUCTS[productKey];
  
  return fetchWithRetry(async () => {
    if (progressTracker) {
      progressTracker.update(config.label, "fetching versions");
    } else {
      console.log(`  Fetching versions for ${config.label}...`);
    }

    const { latest, previous } = await getVersions(productKey);

    if (!latest) {
      console.warn(`  [warn] No ENT versions found for ${config.label}`);
      return {
        product: productKey,
        label: config.label,
        latest: null,
        previous: null,
        whatsNew: [],
        whatsChanged: [],
        highlights: [],
        fetchedAt: new Date().toISOString(),
      };
    }

    if (!progressTracker) {
      console.log(`  ${config.label}: ${previous} → ${latest}`);
      console.log(`  Fetching release notes...`);
    } else {
      progressTracker.update(config.label, "fetching notes");
    }

    const [notes, tracker] = await Promise.all([
      getReleaseNotes(productKey, latest),
      getChangeTracker(productKey, latest),
    ]);

    return {
      product: productKey,
      label: config.label,
      latest,
      previous,
      whatsNew: notes.whatsNew,
      whatsChanged: notes.whatsChanged,
      highlights: tracker.highlights,
      fetchedAt: new Date().toISOString(),
      fallback: notes.fallback || false,
    };
  }, 3, 1000);
}

/**
 * Fetch multiple products with parallel processing and rate limiting.
 * Uses a worker pool pattern to limit concurrency while maintaining politeness.
 *
 * @param {string[]} productKeys - Array of product keys to fetch
 * @param {number} concurrency - Maximum number of concurrent fetches (default: 2)
 * @returns {Promise<Array>} Array of product data objects
 */
export async function fetchProducts(productKeys, concurrency = 2) {
  logFetchMode();
  
  const results = [];
  const queue = [...productKeys];
  const progress = new ProgressTracker(productKeys.length);
  
  // Worker function that processes items from the queue
  async function worker() {
    while (queue.length > 0) {
      const key = queue.shift();
      if (!key) break;
      
      try {
        const data = await fetchProduct(key, progress);
        results.push(data);
      } catch (error) {
        console.error(`\n  [error] Failed to fetch ${key}: ${error.message}`);
        // Add a placeholder result so we don't lose track
        results.push({
          product: key,
          label: PRODUCTS[key]?.label || key,
          latest: null,
          previous: null,
          whatsNew: [],
          whatsChanged: [],
          highlights: [],
          fetchedAt: new Date().toISOString(),
          error: error.message,
        });
      }
      
      // Polite delay between requests (only if more items remain)
      if (queue.length > 0) {
        await new Promise(r => setTimeout(r, 800));
      }
    }
  }
  
  // Start concurrent workers (limited by concurrency parameter)
  const workers = Array.from(
    { length: Math.min(concurrency, productKeys.length) },
    () => worker()
  );
  
  await Promise.all(workers);
  progress.complete();
  
  // Sort results to match original order
  const resultMap = new Map(results.map(r => [r.product, r]));
  return productKeys.map(key => resultMap.get(key)).filter(Boolean);
}

/**
 * Legacy sequential fetch function (kept for backward compatibility).
 * Use fetchProducts() instead for better performance.
 */
export async function fetchProductsSequential(productKeys) {
  logFetchMode();
  const results = [];
  for (const key of productKeys) {
    const data = await fetchProduct(key);
    results.push(data);
    await new Promise((r) => setTimeout(r, 800));
  }
  return results;
}
