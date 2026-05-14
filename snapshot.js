// snapshot.js — state management
// Persists per-product data between runs so we can diff previous vs current
// Snapshots live in ./snapshots/<product>.json (gitignored)

import fs from "fs";
import path from "path";
import { SNAPSHOT_DIR } from "./config.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function snapshotPath(productKey) {
  return path.join(SNAPSHOT_DIR, `${productKey}.json`);
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Reads the last persisted snapshot for a product.
 * Returns null if no snapshot exists yet (first run).
 */
export function readSnapshot(productKey) {
  const filePath = snapshotPath(productKey);
  if (!fs.existsSync(filePath)) return null;

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`  [warn] Could not read snapshot for ${productKey}: ${err.message}`);
    return null;
  }
}

// ─── Write ────────────────────────────────────────────────────────────────────

/**
 * Persists the current fetch result as the new snapshot.
 * Always overwrites — the snapshot is the last known good state.
 */
export function writeSnapshot(productKey, data) {
  ensureDir(SNAPSHOT_DIR);
  const filePath = snapshotPath(productKey);

  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.warn(`  [warn] Could not write snapshot for ${productKey}: ${err.message}`);
  }
}

// ─── Diff ─────────────────────────────────────────────────────────────────────

/**
 * Compares a fresh fetch result against the last snapshot.
 *
 * Returns a diff object:
 * {
 *   isFirstRun: bool,       // no prior snapshot existed
 *   versionChanged: bool,   // latest version differs from snapshot
 *   previousSnapshot: obj,  // the old snapshot (null on first run)
 *   snapshotVersion: str,   // version recorded in snapshot
 *   reportedPrevious: str,  // what to show as "previous" in the report
 * }
 *
 * reportedPrevious logic:
 *   - First run           → show fetched "previous" (second-latest from releases page)
 *   - Version unchanged   → show snapshot's previous (so the report still makes sense)
 *   - Version changed     → show snapshot's latest (that WAS the previous version)
 */
export function diffSnapshot(productKey, freshData) {
  const snapshot = readSnapshot(productKey);

  // First run — no snapshot on disk yet
  if (!snapshot || !snapshot.latest) {
    return {
      isFirstRun: true,
      versionChanged: false,
      previousSnapshot: null,
      snapshotVersion: null,
      reportedPrevious: freshData.previous,
    };
  }

  const versionChanged = snapshot.latest !== freshData.latest;

  return {
    isFirstRun: false,
    versionChanged,
    previousSnapshot: snapshot,
    snapshotVersion: snapshot.latest,
    // If version changed: the old "latest" is now the "previous"
    // If unchanged: use whatever was recorded as previous in the snapshot
    reportedPrevious: versionChanged
      ? snapshot.latest
      : snapshot.previous ?? freshData.previous,
  };
}

// ─── Aggregate ────────────────────────────────────────────────────────────────

/**
 * For a list of product keys, applies diff logic and enriches each data object.
 * Writes updated snapshots after diffing.
 *
 * Returns enriched data array with diff metadata attached.
 */
export function processSnapshots(productDataArray) {
  return productDataArray.map((data) => {
    if (!data.latest) {
      console.log(`  [${data.label}] Fetch failed - keeping existing snapshot`);
      return {
        ...data,
        reportedPrevious: data.previous,
        isFirstRun: false,
        versionChanged: false,
        snapshotVersion: null,
      };
    }

    const diff = diffSnapshot(data.product, data);

    // Enrich the data object with diff context
    const enriched = {
      ...data,
      reportedPrevious: diff.reportedPrevious,
      isFirstRun: diff.isFirstRun,
      versionChanged: diff.versionChanged,
      snapshotVersion: diff.snapshotVersion,
    };

    // Status line for console
    if (diff.isFirstRun) {
      console.log(`  [${data.label}] First run — snapshot created`);
    } else if (diff.versionChanged) {
      console.log(`  [${data.label}] Version changed: ${diff.snapshotVersion} → ${data.latest}`);
    } else {
      console.log(`  [${data.label}] No version change (still ${data.latest})`);
    }

    // Persist the fresh data as the new snapshot
    writeSnapshot(data.product, enriched);

    return enriched;
  });
}
