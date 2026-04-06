# NetSpy — Browser Network Privacy Monitor

A Manifest V3 browser extension for developers and privacy-conscious users. Intercepts all HTTP requests, detects PII in payloads, scores site risk, and provides a full developer toolkit — all client-side, no external backend.

## Features

- **Request Inspector** — live per-tab request list with method, status, URL, and PII badges
- **PII Detection** — scans request/response bodies and headers for emails, credit cards, SSNs, JWTs, API keys, and more
- **Risk Scoring** — per-site risk score (0–100) based on PII severity, shown as a color-coded ring
- **Site Safety Check** — detects phishing indicators, suspicious TLDs, dangerous links, and missing HTTPS
- **Headers Analyzer** — audits security headers (CSP, HSTS, X-Frame-Options, etc.), CORS config, and cookie attributes
- **Performance Monitor** — request counts, data transferred, method breakdown, status code buckets
- **Console Log Viewer** — live console error/warn/info/log capture from the active tab
- **API Tester** — replay any captured request, edit headers/body, view response with timing; copy as cURL or fetch()
- **Dashboard** — full-page history across all sites with filters, PII section, export (JSON/CSV/PDF), and allowlist management

## Tech Stack

- **Manifest V3** — Chrome/Firefox compatible
- **React + Vite** — popup and dashboard UI
- **TypeScript** — strict mode throughout
- **IndexedDB** (via `idb`) — local request history storage
- **pdf-lib** — PDF export, no external calls
- **fast-check + vitest** — property-based and unit tests

## Getting Started

### Prerequisites

- Node.js 18+
- Chrome or Firefox (with MV3 support)

### Install & Build

```bash
npm install
npm run build
```

### Load in Chrome

1. Go to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `dist/` folder

### Development (watch mode)

```bash
npm run dev
```

Then reload the extension in `chrome://extensions` after each change.

### Run Tests

```bash
npm test
```

## Project Structure

```
src/
  background/       # Service worker — request interception pipeline
    index.ts
    filterLogic.ts  # Pure shouldProcessRequest() — testable
  content/          # Content script — console capture + link scanning
    index.ts
  popup/            # Popup UI (React)
    App.tsx
    index.tsx
  dashboard/        # Dashboard UI (React)
    App.tsx
    index.tsx
  components/
    RequestDetailPanel.tsx
  piiDetector.ts    # Pure PII detection — regex + Luhn
  riskScorer.ts     # Pure risk score computation
  storage.ts        # IndexedDB layer
  preferences.ts    # chrome.storage.local wrapper
  reportExporter.ts # JSON / CSV / PDF export
  types.ts          # Shared TypeScript types
  *.test.ts         # Unit tests
  *.property.test.ts # Property-based tests (fast-check)
public/
  manifest.json
  icons/
popup.html
dashboard.html
vite.config.ts
```

## Permissions Used

| Permission | Reason |
|---|---|
| `webRequest` | Intercept HTTP requests |
| `storage` | Persist preferences and risk scores |
| `tabs` | Get current tab URL for popup |
| `downloads` | Trigger report file downloads |
| `alarms` | Daily retention pruning |
| `<all_urls>` | Monitor requests from any site |

## Privacy

All data stays in your browser. No telemetry, no external API calls, no remote backend. The extension itself never makes outbound network requests.

## License

MIT
