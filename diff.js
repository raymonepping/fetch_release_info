// diff.js — Visual diff generation for release tracking
// Compares current release data with previous snapshot to show changes

/**
 * Generates a visual diff between current and previous release data.
 * Returns an object with added, removed, and unchanged items.
 * 
 * @param {Array} currentItems - Current release items (whatsNew, whatsChanged, highlights)
 * @param {Array} previousItems - Previous snapshot items
 * @returns {Object} { added: [], removed: [], unchanged: [] }
 */
export function generateDiff(currentItems = [], previousItems = []) {
  const current = new Set(currentItems.map(normalizeItem));
  const previous = new Set(previousItems.map(normalizeItem));
  
  const added = currentItems.filter(item => !previous.has(normalizeItem(item)));
  const removed = previousItems.filter(item => !current.has(normalizeItem(item)));
  const unchanged = currentItems.filter(item => previous.has(normalizeItem(item)));
  
  return { added, removed, unchanged };
}

/**
 * Normalizes an item for comparison (trims whitespace, lowercases).
 */
function normalizeItem(item) {
  return String(item ?? "").trim().toLowerCase();
}

/**
 * Generates a comprehensive diff report for a product.
 * Compares whatsNew, whatsChanged, and highlights between current and previous.
 * 
 * @param {Object} currentData - Current product data
 * @param {Object} previousSnapshot - Previous snapshot data
 * @returns {Object} Diff report with sections for each category
 */
export function generateProductDiff(currentData, previousSnapshot) {
  if (!previousSnapshot || !previousSnapshot.latest) {
    return {
      hasChanges: false,
      isFirstRun: true,
      whatsNew: { added: currentData.whatsNew || [], removed: [], unchanged: [] },
      whatsChanged: { added: currentData.whatsChanged || [], removed: [], unchanged: [] },
      highlights: { added: currentData.highlights || [], removed: [], unchanged: [] },
    };
  }
  
  const whatsNewDiff = generateDiff(
    currentData.whatsNew || [],
    previousSnapshot.whatsNew || []
  );
  
  const whatsChangedDiff = generateDiff(
    currentData.whatsChanged || [],
    previousSnapshot.whatsChanged || []
  );
  
  const highlightsDiff = generateDiff(
    currentData.highlights || [],
    previousSnapshot.highlights || []
  );
  
  const hasChanges = 
    whatsNewDiff.added.length > 0 ||
    whatsNewDiff.removed.length > 0 ||
    whatsChangedDiff.added.length > 0 ||
    whatsChangedDiff.removed.length > 0 ||
    highlightsDiff.added.length > 0 ||
    highlightsDiff.removed.length > 0;
  
  return {
    hasChanges,
    isFirstRun: false,
    versionChanged: currentData.latest !== previousSnapshot.latest,
    previousVersion: previousSnapshot.latest,
    currentVersion: currentData.latest,
    whatsNew: whatsNewDiff,
    whatsChanged: whatsChangedDiff,
    highlights: highlightsDiff,
  };
}

/**
 * Formats diff for Markdown output.
 * Shows added (+), removed (-), and unchanged items.
 * 
 * @param {Object} diff - Diff object from generateDiff()
 * @param {string} sectionTitle - Title for this section
 * @returns {string} Markdown formatted diff
 */
export function formatDiffMarkdown(diff, sectionTitle) {
  if (!diff.added.length && !diff.removed.length && !diff.unchanged.length) {
    return `### ${sectionTitle}\n\n_No items recorded._\n`;
  }
  
  let output = `### ${sectionTitle}\n\n`;
  
  if (diff.added.length > 0) {
    output += `**✨ Added (${diff.added.length}):**\n`;
    diff.added.forEach(item => {
      output += `- ✅ ${item}\n`;
    });
    output += '\n';
  }
  
  if (diff.removed.length > 0) {
    output += `**🗑️ Removed (${diff.removed.length}):**\n`;
    diff.removed.forEach(item => {
      output += `- ❌ ~~${item}~~\n`;
    });
    output += '\n';
  }
  
  if (diff.unchanged.length > 0 && (diff.added.length > 0 || diff.removed.length > 0)) {
    output += `**📋 Unchanged (${diff.unchanged.length}):**\n`;
    diff.unchanged.forEach(item => {
      output += `- ${item}\n`;
    });
    output += '\n';
  } else if (diff.unchanged.length > 0) {
    // If nothing changed, just show the items normally
    diff.unchanged.forEach(item => {
      output += `- ${item}\n`;
    });
    output += '\n';
  }
  
  return output;
}

/**
 * Formats diff for HTML output with color coding.
 * 
 * @param {Object} diff - Diff object from generateDiff()
 * @param {string} sectionTitle - Title for this section
 * @returns {string} HTML formatted diff
 */
export function formatDiffHtml(diff, sectionTitle) {
  if (!diff.added.length && !diff.removed.length && !diff.unchanged.length) {
    return `<div class="diff-section">
      <h3 class="section-title">${escapeHtml(sectionTitle)}</h3>
      <p><em>No items recorded.</em></p>
    </div>`;
  }
  
  let output = `<div class="diff-section">
    <h3 class="section-title">${escapeHtml(sectionTitle)}</h3>`;
  
  if (diff.added.length > 0) {
    output += `<div class="diff-added">
      <strong>✨ Added (${diff.added.length}):</strong>
      <ul>`;
    diff.added.forEach(item => {
      output += `<li class="added-item">✅ ${escapeHtml(item)}</li>`;
    });
    output += `</ul></div>`;
  }
  
  if (diff.removed.length > 0) {
    output += `<div class="diff-removed">
      <strong>🗑️ Removed (${diff.removed.length}):</strong>
      <ul>`;
    diff.removed.forEach(item => {
      output += `<li class="removed-item">❌ <del>${escapeHtml(item)}</del></li>`;
    });
    output += `</ul></div>`;
  }
  
  if (diff.unchanged.length > 0 && (diff.added.length > 0 || diff.removed.length > 0)) {
    output += `<div class="diff-unchanged">
      <strong>📋 Unchanged (${diff.unchanged.length}):</strong>
      <ul>`;
    diff.unchanged.forEach(item => {
      output += `<li>${escapeHtml(item)}</li>`;
    });
    output += `</ul></div>`;
  } else if (diff.unchanged.length > 0) {
    output += `<ul>`;
    diff.unchanged.forEach(item => {
      output += `<li>${escapeHtml(item)}</li>`;
    });
    output += `</ul>`;
  }
  
  output += `</div>`;
  return output;
}

/**
 * Generates a summary of changes for a product.
 * 
 * @param {Object} productDiff - Product diff from generateProductDiff()
 * @returns {string} Human-readable summary
 */
export function generateChangeSummary(productDiff) {
  if (productDiff.isFirstRun) {
    return "First run - no previous data to compare";
  }
  
  if (!productDiff.hasChanges && !productDiff.versionChanged) {
    return "No changes detected";
  }
  
  const changes = [];
  
  if (productDiff.versionChanged) {
    changes.push(`Version: ${productDiff.previousVersion} → ${productDiff.currentVersion}`);
  }
  
  const totalAdded = 
    productDiff.whatsNew.added.length +
    productDiff.whatsChanged.added.length +
    productDiff.highlights.added.length;
  
  const totalRemoved =
    productDiff.whatsNew.removed.length +
    productDiff.whatsChanged.removed.length +
    productDiff.highlights.removed.length;
  
  if (totalAdded > 0) {
    changes.push(`${totalAdded} items added`);
  }
  
  if (totalRemoved > 0) {
    changes.push(`${totalRemoved} items removed`);
  }
  
  return changes.length > 0 ? changes.join(', ') : "No changes detected";
}

/**
 * CSS styles for HTML diff visualization.
 */
export const diffStyles = `
  .diff-section {
    margin: 1.5rem 0;
  }
  
  .diff-added {
    background: #f0fdf4;
    border-left: 3px solid #22c55e;
    padding: 0.75rem 1rem;
    margin: 0.5rem 0;
    border-radius: 4px;
  }
  
  .diff-removed {
    background: #fef2f2;
    border-left: 3px solid #ef4444;
    padding: 0.75rem 1rem;
    margin: 0.5rem 0;
    border-radius: 4px;
  }
  
  .diff-unchanged {
    background: #f9fafb;
    border-left: 3px solid #9ca3af;
    padding: 0.75rem 1rem;
    margin: 0.5rem 0;
    border-radius: 4px;
  }
  
  .added-item {
    color: #15803d;
  }
  
  .removed-item {
    color: #b91c1c;
  }
  
  .diff-summary {
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    border-radius: 6px;
    padding: 1rem;
    margin: 1rem 0;
    font-size: 0.9rem;
  }
  
  .diff-summary strong {
    color: #1e40af;
  }
`;

function escapeHtml(str) {
  const text = String(str);
  return text
    .replace(/&/g, '&' + 'amp;')
    .replace(/</g, '&' + 'lt;')
    .replace(/>/g, '&' + 'gt;')
    .replace(/"/g, '&' + 'quot;');
}

// Made with Bob
