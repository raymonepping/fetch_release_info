#!/usr/bin/env node
// dashboard.js — Web dashboard for HashiCorp Release Tracker
// Provides a web interface to view releases, trigger fetches, and see diffs

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PRODUCTS, ENTERPRISE_PRODUCTS, ALL_PRODUCTS, OUTPUT_DIR, SNAPSHOT_DIR } from './config.js';
import { fetchProducts } from './fetcher.js';
import { processSnapshots } from './snapshot.js';
import { render } from './renderer.js';
import { generateProductDiff, generateChangeSummary } from './diff.js';
import { readSnapshot } from './snapshot.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── API Routes ───────────────────────────────────────────────────────────────

/**
 * GET /api/products
 * Returns list of all supported products with their current status
 */
app.get('/api/products', (req, res) => {
  try {
    // Only show Enterprise products by default
    const products = ENTERPRISE_PRODUCTS.map(key => {
      const config = PRODUCTS[key];
      const snapshot = readSnapshot(key);
      
      return {
        key,
        label: config.label,
        latest: snapshot?.latest || null,
        previous: snapshot?.previous || null,
        lastFetched: snapshot?.fetchedAt || null,
        hasSnapshot: !!snapshot
      };
    });
    
    res.json({ success: true, products });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/product/:key
 * Returns detailed information for a specific product
 */
app.get('/api/product/:key', (req, res) => {
  try {
    const { key } = req.params;
    
    if (!PRODUCTS[key]) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }
    
    const config = PRODUCTS[key];
    const snapshot = readSnapshot(key);
    
    if (!snapshot) {
      return res.json({
        success: true,
        product: {
          key,
          label: config.label,
          hasData: false,
          message: 'No data available. Run a fetch first.'
        }
      });
    }
    
    // Generate diff if previous snapshot exists
    const productDiff = generateProductDiff(snapshot, snapshot);
    const summary = generateChangeSummary(productDiff);
    
    res.json({
      success: true,
      product: {
        key,
        label: config.label,
        latest: snapshot.latest,
        previous: snapshot.previous,
        whatsNew: snapshot.whatsNew || [],
        whatsChanged: snapshot.whatsChanged || [],
        highlights: snapshot.highlights || [],
        lastFetched: snapshot.fetchedAt,
        changeSummary: summary,
        hasData: true
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/fetch
 * Triggers a fetch for specified products
 * Body: { products: ['vault', 'consul'], concurrency: 2 }
 */
app.post('/api/fetch', async (req, res) => {
  try {
    const { products, concurrency = 2 } = req.body;
    
    if (!products || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Products array is required' 
      });
    }
    
    // Validate products
    const invalidProducts = products.filter(p => !PRODUCTS[p]);
    if (invalidProducts.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Invalid products: ${invalidProducts.join(', ')}`
      });
    }
    
    console.log(`[Dashboard] Fetching ${products.length} products...`);
    
    // Fetch data
    const results = await fetchProducts(products, concurrency);
    
    // Process snapshots
    const enriched = processSnapshots(results);
    
    // Return results
    const summary = enriched.map(data => ({
      product: data.product,
      label: data.label,
      latest: data.latest,
      previous: data.reportedPrevious,
      versionChanged: data.versionChanged,
      isFirstRun: data.isFirstRun
    }));
    
    res.json({
      success: true,
      message: `Fetched ${products.length} products`,
      results: summary
    });
  } catch (error) {
    console.error('[Dashboard] Fetch error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/generate
 * Generates reports for specified products
 * Body: { products: ['vault'], format: 'html', scope: 'individual' }
 */
app.post('/api/generate', async (req, res) => {
  try {
    const { products, format = 'html', scope = 'individual' } = req.body;
    
    if (!products || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Products array is required' 
      });
    }
    
    // Read snapshots for selected products
    const dataArray = products.map(key => {
      const snapshot = readSnapshot(key);
      if (!snapshot) {
        throw new Error(`No data available for ${key}. Run a fetch first.`);
      }
      return snapshot;
    }).filter(Boolean);
    
    if (dataArray.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No data available for selected products'
      });
    }
    
    // Generate reports
    const files = await render(dataArray, format, scope);
    
    res.json({
      success: true,
      message: `Generated ${files.length} report(s)`,
      files: files.map(f => path.basename(f))
    });
  } catch (error) {
    console.error('[Dashboard] Generate error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/reports
 * Lists all generated reports in the output directory
 */
app.get('/api/reports', (req, res) => {
  try {
    if (!fs.existsSync(OUTPUT_DIR)) {
      return res.json({ success: true, reports: [] });
    }
    
    const files = fs.readdirSync(OUTPUT_DIR)
      .filter(f => f.match(/\.(md|html|pdf)$/))
      .map(filename => {
        const filepath = path.join(OUTPUT_DIR, filename);
        const stats = fs.statSync(filepath);
        
        return {
          filename,
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime,
          type: path.extname(filename).slice(1)
        };
      })
      .sort((a, b) => b.modified - a.modified);
    
    res.json({ success: true, reports: files });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/report/:filename
 * Serves a specific report file
 */
app.get('/api/report/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    const filepath = path.join(OUTPUT_DIR, filename);
    
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ success: false, error: 'Report not found' });
    }
    
    // Set appropriate content type
    const ext = path.extname(filename);
    const contentTypes = {
      '.md': 'text/markdown',
      '.html': 'text/html',
      '.pdf': 'application/pdf'
    };
    
    res.setHeader('Content-Type', contentTypes[ext] || 'application/octet-stream');
    res.sendFile(filepath);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/diff/:key
 * Returns diff information for a product compared to previous snapshot
 */
app.get('/api/diff/:key', (req, res) => {
  try {
    const { key } = req.params;
    
    if (!PRODUCTS[key]) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }
    
    const snapshot = readSnapshot(key);
    if (!snapshot) {
      return res.json({
        success: true,
        hasDiff: false,
        message: 'No snapshot available'
      });
    }
    
    const productDiff = generateProductDiff(snapshot, snapshot);
    
    res.json({
      success: true,
      hasDiff: productDiff.hasChanges,
      diff: {
        summary: generateChangeSummary(productDiff),
        versionChanged: productDiff.versionChanged,
        previousVersion: productDiff.previousVersion,
        currentVersion: productDiff.currentVersion,
        whatsNew: productDiff.whatsNew,
        whatsChanged: productDiff.whatsChanged,
        highlights: productDiff.highlights
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Serve Frontend ───────────────────────────────────────────────────────────

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start Server ─────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  🚀 HashiCorp Release Tracker Dashboard
  
  URL:     http://localhost:${PORT}
  API:     http://localhost:${PORT}/api
  
  Press Ctrl+C to stop
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);
});

// Made with Bob
