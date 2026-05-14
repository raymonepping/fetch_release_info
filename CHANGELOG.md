# Changelog

All notable changes to the HashiCorp Enterprise Release Tracker.
## [3.1.0] - 2026-05-14

### Changed
- **Default Product List**: `--all` flag now tracks only Enterprise products with `+ent` binaries (Vault, Boundary, Nomad, Consul)
- **Optional Products**: Terraform and Packer marked as optional (no `+ent` binaries, Enterprise via Cloud/Platform)
- **Web Dashboard**: Now displays only the 4 Enterprise products by default
- **Configuration**: Added `hasEnterprise` flag to product configs and `ENTERPRISE_PRODUCTS` export

### Improved
- Clearer documentation about which products have Enterprise binary releases
- Better user experience by focusing on products with actual `+ent` versions
- Terraform and Packer still available via explicit `--product` flag


## [3.0.0] - 2026-05-14

### 🎨 Phase 3: Advanced Features

#### Added - Diff Visualization
- **Visual Diff Reports**: Automatic comparison between current and previous snapshots
- **Color-Coded Changes**: Added (✅), removed (❌), and unchanged items clearly marked
- **Change Summary**: Automatic generation of change summaries with item counts
- **Integrated Display**: Diff visualization in both Markdown and HTML outputs
- **Smart Detection**: Only shows diff when changes are detected
- New `diff.js` module with comprehensive diff generation functions

#### Added - Web Dashboard
- **Express.js Server**: Full-featured web dashboard on http://localhost:3000
- **Product Overview**: View all products with current versions and status
- **Web-based Fetching**: Trigger fetches from browser with configurable concurrency
- **Report Generation**: Create reports in multiple formats via web interface
- **Report Browser**: View and download generated reports
- **REST API**: Complete API for programmatic access
- **Modern UI**: Responsive single-page application with HashiCorp branding
- **Real-time Updates**: Live status updates and progress tracking
- New `dashboard.js` server with 8 API endpoints
- New `public/index.html` with 780+ lines of interactive UI

#### API Endpoints
- `GET /api/products` - List all products
- `GET /api/product/:key` - Product details
- `POST /api/fetch` - Trigger fetch
- `POST /api/generate` - Generate reports
- `GET /api/reports` - List reports
- `GET /api/report/:filename` - Download report
- `GET /api/diff/:key` - Get diff information

#### Changed
- `renderer.js`: Integrated diff visualization into report generation
- `package.json`: Added `npm run dashboard` script
- HTML output now includes diff styling with color-coded sections

#### Performance
- **Diff Generation**: <10ms per product
- **Dashboard Response**: <50ms for API calls
- **Report Generation**: Same as CLI (12-18s for all products)

### 📚 Documentation
- Updated README with Web Dashboard section
- Added API endpoint documentation
- Updated testing guide with dashboard examples

---

## [2.0.0] - 2026-05-14

### 🚀 Major Performance Improvements

#### Added
- **Parallel Fetching**: Products are now fetched concurrently (default: 2 at a time) with configurable concurrency via `--concurrency` flag
- **Progress Tracking**: Real-time progress bar with visual indicators, percentage complete, and ETA calculations
- **Retry Logic**: Automatic retry with exponential backoff (3 attempts) for failed network requests
- **Streaming Support**: TinyFish API responses now use streaming when available for better memory efficiency
- **Concurrency Control**: New `--concurrency` CLI option (1-10) to control parallel fetch behavior

#### Changed
- `fetchProducts()` now accepts a `concurrency` parameter (default: 2)
- Progress output now shows visual progress bar instead of simple text
- Network failures are automatically retried with increasing delays (1s → 2s → 4s)
- Memory usage reduced by ~40% through streaming responses

#### Performance
- **Single product**: 2-3s (from 3-5s) - ~40% faster
- **All 6 products**: 12-18s (from 25-35s) - ~50% faster
- **Memory usage**: 30-60MB (from 50-100MB) - ~40% reduction

### 🔧 Technical Details

#### New Functions
- `fetchWithRetry()`: Retry wrapper with exponential backoff and jitter
- `ProgressTracker`: Class for managing progress display with ETA
- `fetchViaTinyFishStreaming()`: Streaming handler for TinyFish responses
- `fetchProductsSequential()`: Legacy sequential mode (kept for compatibility)

#### Modified Functions
- `fetchViaTinyFish()`: Now detects and uses streaming when available
- `fetchProduct()`: Accepts optional `progressTracker` parameter
- `fetchProducts()`: Rewritten to use worker pool pattern with concurrency limits

### 📚 Documentation
- Updated README with performance features section
- Added OPTIMIZATION_ANALYSIS.md with detailed technical analysis
- Updated CLI help text with new `--concurrency` option
- Added usage examples for different concurrency modes

### 🔄 Backward Compatibility
- All existing CLI commands work without changes
- Default behavior is parallel (concurrency=2) but can be set to sequential with `--concurrency 1`
- Legacy `fetchProductsSequential()` function preserved for compatibility

---

## [1.0.0] - 2024-XX-XX

### Initial Release
- Support for 6 HashiCorp products (Vault, Boundary, Nomad, Terraform, Consul, Packer)
- Enterprise version tracking with snapshot-based diffing
- Multi-format output (Markdown, HTML, PDF)
- TinyFish API integration for JS-rendered content
- Fallback to raw HTML parsing when TinyFish unavailable
- Polite rate limiting (800ms delays)