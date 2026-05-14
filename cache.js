// cache.js — Smart caching layer with HTTP ETags and TTL
// Reduces redundant fetches and improves performance

import fs from "fs";
import path from "path";
import crypto from "crypto";

const CACHE_DIR = "./cache";
const DEFAULT_TTL = 3600000; // 1 hour in milliseconds

// ─── Cache Manager ────────────────────────────────────────────────────────────

export class ResponseCache {
  constructor(cacheDir = CACHE_DIR, ttl = DEFAULT_TTL) {
    this.cacheDir = cacheDir;
    this.ttl = ttl;
    this.ensureDir(this.cacheDir);
  }

  ensureDir(dir) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Generate a cache key from URL
   */
  getCacheKey(url) {
    return crypto.createHash('md5').update(url).digest('hex');
  }

  /**
   * Get the file path for a cached URL
   */
  getCachePath(url) {
    return path.join(this.cacheDir, `${this.getCacheKey(url)}.json`);
  }

  /**
   * Get cached response if valid
   * @param {string} url - The URL to check
   * @returns {Object|null} Cached data or null if expired/missing
   */
  get(url) {
    const cachePath = this.getCachePath(url);
    
    if (!fs.existsSync(cachePath)) {
      return null;
    }

    try {
      const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      const age = Date.now() - cached.timestamp;

      // Check if cache is expired
      if (age > this.ttl) {
        fs.unlinkSync(cachePath);
        return null;
      }

      return {
        data: cached.data,
        etag: cached.etag,
        age: age,
        fresh: age < (this.ttl / 2), // Consider fresh if less than half TTL
      };
    } catch (error) {
      console.warn(`  [cache] Error reading cache for ${url}: ${error.message}`);
      return null;
    }
  }

  /**
   * Store response in cache
   * @param {string} url - The URL being cached
   * @param {*} data - The data to cache
   * @param {string} etag - Optional ETag for validation
   */
  set(url, data, etag = null) {
    const cachePath = this.getCachePath(url);
    
    try {
      const cacheEntry = {
        url,
        timestamp: Date.now(),
        etag,
        data,
      };
      
      fs.writeFileSync(cachePath, JSON.stringify(cacheEntry, null, 2), 'utf8');
    } catch (error) {
      console.warn(`  [cache] Error writing cache for ${url}: ${error.message}`);
    }
  }

  /**
   * Check if cached data is still valid using ETag
   * @param {string} url - The URL to validate
   * @param {string} serverEtag - ETag from server
   * @returns {boolean} True if cache is still valid
   */
  isValid(url, serverEtag) {
    const cached = this.get(url);
    if (!cached || !cached.etag || !serverEtag) {
      return false;
    }
    return cached.etag === serverEtag;
  }

  /**
   * Clear all cached entries
   */
  clear() {
    if (fs.existsSync(this.cacheDir)) {
      const files = fs.readdirSync(this.cacheDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          fs.unlinkSync(path.join(this.cacheDir, file));
        }
      }
      console.log(`  [cache] Cleared ${files.length} cached entries`);
    }
  }

  /**
   * Clear expired entries only
   */
  clearExpired() {
    if (!fs.existsSync(this.cacheDir)) {
      return;
    }

    const files = fs.readdirSync(this.cacheDir);
    let cleared = 0;

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      
      const filePath = path.join(this.cacheDir, file);
      try {
        const cached = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const age = Date.now() - cached.timestamp;
        
        if (age > this.ttl) {
          fs.unlinkSync(filePath);
          cleared++;
        }
      } catch (error) {
        // Invalid cache file, remove it
        fs.unlinkSync(filePath);
        cleared++;
      }
    }

    if (cleared > 0) {
      console.log(`  [cache] Cleared ${cleared} expired entries`);
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    if (!fs.existsSync(this.cacheDir)) {
      return { total: 0, fresh: 0, stale: 0, size: 0 };
    }

    const files = fs.readdirSync(this.cacheDir);
    let total = 0;
    let fresh = 0;
    let stale = 0;
    let size = 0;

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      
      const filePath = path.join(this.cacheDir, file);
      try {
        const stats = fs.statSync(filePath);
        size += stats.size;
        
        const cached = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const age = Date.now() - cached.timestamp;
        
        total++;
        if (age < (this.ttl / 2)) {
          fresh++;
        } else if (age < this.ttl) {
          stale++;
        }
      } catch (error) {
        // Skip invalid files
      }
    }

    return {
      total,
      fresh,
      stale,
      expired: total - fresh - stale,
      size: (size / 1024).toFixed(2) + ' KB',
    };
  }
}

// ─── Version-specific cache ───────────────────────────────────────────────────

/**
 * Specialized cache for version data that rarely changes
 */
export class VersionCache extends ResponseCache {
  constructor() {
    super('./cache/versions', 86400000); // 24 hour TTL for versions
  }

  /**
   * Cache version data with product key
   */
  setVersion(productKey, versionData) {
    this.set(`version:${productKey}`, versionData);
  }

  /**
   * Get cached version data
   */
  getVersion(productKey) {
    return this.get(`version:${productKey}`);
  }
}

// ─── Release notes cache ──────────────────────────────────────────────────────

/**
 * Specialized cache for release notes (longer TTL since they don't change)
 */
export class ReleaseNotesCache extends ResponseCache {
  constructor() {
    super('./cache/notes', 604800000); // 7 day TTL for release notes
  }

  /**
   * Cache release notes with product and version
   */
  setNotes(productKey, version, notesData) {
    this.set(`notes:${productKey}:${version}`, notesData);
  }

  /**
   * Get cached release notes
   */
  getNotes(productKey, version) {
    return this.get(`notes:${productKey}:${version}`);
  }
}

// ─── Export singleton instances ───────────────────────────────────────────────

export const responseCache = new ResponseCache();
export const versionCache = new VersionCache();
export const releaseNotesCache = new ReleaseNotesCache();

// Made with Bob
