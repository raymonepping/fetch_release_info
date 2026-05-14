// validator.js — Configuration validation
// Validates product configurations and runtime parameters

import { PRODUCTS, ALL_PRODUCTS } from "./config.js";

// ─── Configuration Validation ─────────────────────────────────────────────────

/**
 * Validate product configuration structure
 * @returns {Object} { valid: boolean, errors: string[] }
 */
export function validateConfig() {
  const errors = [];

  // Check if PRODUCTS exists and is an object
  if (!PRODUCTS || typeof PRODUCTS !== 'object') {
    errors.push('PRODUCTS configuration is missing or invalid');
    return { valid: false, errors };
  }

  // Validate each product configuration
  for (const [key, config] of Object.entries(PRODUCTS)) {
    const prefix = `Product "${key}"`;

    // Required fields
    if (!config.label) {
      errors.push(`${prefix}: missing "label" field`);
    }
    if (!config.releasesUrl) {
      errors.push(`${prefix}: missing "releasesUrl" field`);
    } else if (!isValidUrl(config.releasesUrl)) {
      errors.push(`${prefix}: invalid "releasesUrl" - must be a valid URL`);
    }
    if (!config.releaseNotesUrl) {
      errors.push(`${prefix}: missing "releaseNotesUrl" field`);
    } else if (!isValidUrl(config.releaseNotesUrl)) {
      errors.push(`${prefix}: invalid "releaseNotesUrl" - must be a valid URL`);
    }
    if (!config.changeTrackerUrl) {
      errors.push(`${prefix}: missing "changeTrackerUrl" field`);
    } else if (!isValidUrl(config.changeTrackerUrl)) {
      errors.push(`${prefix}: invalid "changeTrackerUrl" - must be a valid URL`);
    }
    if (!config.entSuffix) {
      errors.push(`${prefix}: missing "entSuffix" field`);
    }
    if (!config.versionPattern) {
      errors.push(`${prefix}: missing "versionPattern" field`);
    } else if (!(config.versionPattern instanceof RegExp)) {
      errors.push(`${prefix}: "versionPattern" must be a RegExp`);
    }

    // Validate URL domains (should be hashicorp.com)
    if (config.releasesUrl && !config.releasesUrl.includes('hashicorp.com')) {
      errors.push(`${prefix}: "releasesUrl" should be a hashicorp.com domain`);
    }
    if (config.releaseNotesUrl && !config.releaseNotesUrl.includes('hashicorp.com')) {
      errors.push(`${prefix}: "releaseNotesUrl" should be a hashicorp.com domain`);
    }
  }

  // Check ALL_PRODUCTS consistency
  const configKeys = Object.keys(PRODUCTS);
  const allProductsSet = new Set(ALL_PRODUCTS);
  const configKeysSet = new Set(configKeys);

  for (const key of ALL_PRODUCTS) {
    if (!configKeysSet.has(key)) {
      errors.push(`ALL_PRODUCTS contains "${key}" but it's not in PRODUCTS`);
    }
  }

  for (const key of configKeys) {
    if (!allProductsSet.has(key)) {
      errors.push(`PRODUCTS contains "${key}" but it's not in ALL_PRODUCTS`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    productCount: configKeys.length,
  };
}

/**
 * Validate runtime parameters
 * @param {Object} params - Runtime parameters to validate
 * @returns {Object} { valid: boolean, errors: string[] }
 */
export function validateRuntimeParams(params) {
  const errors = [];

  // Validate products array
  if (!Array.isArray(params.products)) {
    errors.push('products must be an array');
  } else if (params.products.length === 0) {
    errors.push('products array cannot be empty');
  } else {
    for (const product of params.products) {
      if (!ALL_PRODUCTS.includes(product)) {
        errors.push(`Unknown product: "${product}". Valid products: ${ALL_PRODUCTS.join(', ')}`);
      }
    }
  }

  // Validate format
  const validFormats = ['md', 'html', 'pdf', 'all'];
  if (!validFormats.includes(params.format)) {
    errors.push(`Invalid format: "${params.format}". Valid formats: ${validFormats.join(', ')}`);
  }

  // Validate scope
  const validScopes = ['individual', 'combined', 'both'];
  if (!validScopes.includes(params.scope)) {
    errors.push(`Invalid scope: "${params.scope}". Valid scopes: ${validScopes.join(', ')}`);
  }

  // Validate concurrency
  if (typeof params.concurrency !== 'number') {
    errors.push('concurrency must be a number');
  } else if (params.concurrency < 1 || params.concurrency > 10) {
    errors.push('concurrency must be between 1 and 10');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate environment variables
 * @returns {Object} { valid: boolean, warnings: string[], info: Object }
 */
export function validateEnvironment() {
  const warnings = [];
  const info = {};

  // Check TinyFish API key
  if (!process.env.TINYFISH_API_KEY) {
    warnings.push('TINYFISH_API_KEY not set - will use raw HTML parsing (slower, less accurate)');
    info.tinyfishEnabled = false;
  } else {
    info.tinyfishEnabled = true;
    info.tinyfishKeyLength = process.env.TINYFISH_API_KEY.length;
  }

  // Check Node version
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
  if (majorVersion < 18) {
    warnings.push(`Node.js ${nodeVersion} detected. Minimum recommended version is 18.0.0`);
  }
  info.nodeVersion = nodeVersion;

  // Check available memory
  const totalMemory = (require('os').totalmem() / 1024 / 1024 / 1024).toFixed(2);
  const freeMemory = (require('os').freemem() / 1024 / 1024 / 1024).toFixed(2);
  info.memory = {
    total: `${totalMemory} GB`,
    free: `${freeMemory} GB`,
  };

  if (parseFloat(freeMemory) < 0.5) {
    warnings.push(`Low available memory: ${freeMemory} GB. Consider closing other applications.`);
  }

  return {
    valid: true, // Environment warnings don't prevent execution
    warnings,
    info,
  };
}

/**
 * Run all validations
 * @param {Object} runtimeParams - Optional runtime parameters to validate
 * @returns {Object} Complete validation results
 */
export function validateAll(runtimeParams = null) {
  const results = {
    config: validateConfig(),
    environment: validateEnvironment(),
    runtime: runtimeParams ? validateRuntimeParams(runtimeParams) : null,
  };

  results.allValid = results.config.valid && 
                     (!results.runtime || results.runtime.valid);

  return results;
}

/**
 * Print validation results to console
 * @param {Object} results - Validation results from validateAll()
 */
export function printValidationResults(results) {
  console.log('\n=== Configuration Validation ===\n');

  // Config validation
  if (results.config.valid) {
    console.log(`✓ Configuration valid (${results.config.productCount} products)`);
  } else {
    console.log('✗ Configuration errors:');
    for (const error of results.config.errors) {
      console.log(`  - ${error}`);
    }
  }

  // Environment validation
  if (results.environment.warnings.length === 0) {
    console.log('✓ Environment OK');
  } else {
    console.log('⚠ Environment warnings:');
    for (const warning of results.environment.warnings) {
      console.log(`  - ${warning}`);
    }
  }

  // Runtime validation
  if (results.runtime) {
    if (results.runtime.valid) {
      console.log('✓ Runtime parameters valid');
    } else {
      console.log('✗ Runtime parameter errors:');
      for (const error of results.runtime.errors) {
        console.log(`  - ${error}`);
      }
    }
  }

  console.log();
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch {
    return false;
  }
}

// Made with Bob
