// Report Exporter for Browser Network Privacy Monitor
// Supports JSON, CSV, and PDF export formats
// Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { getRecordsByOrigin, getAllOriginSummaries } from './storage';
import type { RequestRecord, ExportScope, ExportFormat } from './types';

// ── helpers ──────────────────────────────────────────────────────────────────

function todayDateString(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function filename(ext: string): string {
  return `network-privacy-report-${todayDateString()}.${ext}`;
}

function triggerDownload(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke after a short delay to allow the download to start
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

async function fetchRecords(scope: ExportScope): Promise<RequestRecord[]> {
  if (scope.scope === 'site' && scope.origin) {
    return getRecordsByOrigin(scope.origin);
  }
  // All origins
  const summaries = await getAllOriginSummaries();
  const results = await Promise.all(
    summaries.map((s) => getRecordsByOrigin(s.origin))
  );
  return results.flat();
}

// ── JSON export ───────────────────────────────────────────────────────────────

function exportJSON(records: RequestRecord[], scope: ExportScope): Blob {
  const payload = {
    metadata: {
      generatedAt: new Date().toISOString(),
      scope,
    },
    records,
  };
  return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
}

// ── CSV export ────────────────────────────────────────────────────────────────

function csvEscape(value: string): string {
  // Wrap in quotes if the value contains comma, quote, or newline
  if (value.includes('"') || value.includes(',') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function exportCSV(records: RequestRecord[]): Blob {
  const header = ['timestamp', 'site', 'method', 'url', 'status_code', 'pii_detected', 'pii_types', 'risk_score'];
  const rows: string[] = [header.join(',')];

  for (const r of records) {
    const piiDetected = r.piiFindings.length > 0 ? 'true' : 'false';
    const piiTypes = r.piiFindings.map((f) => f.type).join(';');
    const row = [
      csvEscape(new Date(r.timestampMs).toISOString()),
      csvEscape(r.origin),
      csvEscape(r.method),
      csvEscape(r.url),
      String(r.responseStatusCode),
      piiDetected,
      csvEscape(piiTypes),
      String(r.riskContribution),
    ];
    rows.push(row.join(','));
  }

  return new Blob([rows.join('\n')], { type: 'text/csv' });
}

// ── PDF export ────────────────────────────────────────────────────────────────

const PAGE_WIDTH = 595;   // A4 points
const PAGE_HEIGHT = 842;
const MARGIN = 40;
const LINE_HEIGHT = 14;
const FONT_SIZE = 9;
const TITLE_SIZE = 14;
const SECTION_SIZE = 11;

interface PDFContext {
  doc: PDFDocument;
  font: Awaited<ReturnType<PDFDocument['embedFont']>>;
  boldFont: Awaited<ReturnType<PDFDocument['embedFont']>>;
  page: ReturnType<PDFDocument['addPage']>;
  y: number;
}

function newPage(ctx: PDFContext): void {
  ctx.page = ctx.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  ctx.y = PAGE_HEIGHT - MARGIN;
}

function ensureSpace(ctx: PDFContext, needed: number): void {
  if (ctx.y - needed < MARGIN) {
    newPage(ctx);
  }
}

function drawText(
  ctx: PDFContext,
  text: string,
  opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; x?: number } = {}
): void {
  const size = opts.size ?? FONT_SIZE;
  const font = opts.bold ? ctx.boldFont : ctx.font;
  const color = opts.color ?? rgb(0, 0, 0);
  const x = opts.x ?? MARGIN;
  ctx.page.drawText(text, { x, y: ctx.y, size, font, color });
  ctx.y -= LINE_HEIGHT;
}

function drawHRule(ctx: PDFContext): void {
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: PAGE_WIDTH - MARGIN, y: ctx.y },
    thickness: 0.5,
    color: rgb(0.7, 0.7, 0.7),
  });
  ctx.y -= 6;
}

async function exportPDF(records: RequestRecord[], scope: ExportScope): Promise<Blob> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

  const ctx: PDFContext = {
    doc,
    font,
    boldFont,
    page: doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
    y: PAGE_HEIGHT - MARGIN,
  };

  // ── Title ──
  drawText(ctx, 'Network Privacy Report', { size: TITLE_SIZE, bold: true });
  drawText(ctx, `Generated: ${new Date().toISOString()}`, { size: FONT_SIZE });
  drawText(ctx, `Scope: ${scope.scope === 'site' && scope.origin ? scope.origin : 'All Sites'}`, { size: FONT_SIZE });
  ctx.y -= 6;
  drawHRule(ctx);

  // ── Summary ──
  drawText(ctx, 'Summary', { size: SECTION_SIZE, bold: true });
  ctx.y -= 2;
  drawText(ctx, `Total requests: ${records.length}`);

  const piiRecords = records.filter((r) => r.piiFindings.length > 0);
  drawText(ctx, `Requests with PII: ${piiRecords.length}`);

  const origins = [...new Set(records.map((r) => r.origin))];
  drawText(ctx, `Unique sites: ${origins.length}`);
  ctx.y -= 6;
  drawHRule(ctx);

  // ── Per-site risk table ──
  drawText(ctx, 'Per-Site Risk Summary', { size: SECTION_SIZE, bold: true });
  ctx.y -= 2;

  // Build per-site stats
  const siteMap = new Map<string, { count: number; maxRisk: number; piiCount: number }>();
  for (const r of records) {
    const s = siteMap.get(r.origin) ?? { count: 0, maxRisk: 0, piiCount: 0 };
    s.count += 1;
    if (r.riskContribution > s.maxRisk) s.maxRisk = r.riskContribution;
    if (r.piiFindings.length > 0) s.piiCount += 1;
    siteMap.set(r.origin, s);
  }

  // Table header
  const colSite = MARGIN;
  const colReqs = 300;
  const colPII = 370;
  const colRisk = 450;

  ensureSpace(ctx, LINE_HEIGHT * 2);
  const headerY = ctx.y;
  ctx.page.drawRectangle({
    x: MARGIN,
    y: headerY - LINE_HEIGHT + 3,
    width: PAGE_WIDTH - MARGIN * 2,
    height: LINE_HEIGHT,
    color: rgb(0.9, 0.9, 0.9),
  });
  ctx.page.drawText('Site', { x: colSite, y: headerY, size: FONT_SIZE, font: boldFont, color: rgb(0, 0, 0) });
  ctx.page.drawText('Requests', { x: colReqs, y: headerY, size: FONT_SIZE, font: boldFont, color: rgb(0, 0, 0) });
  ctx.page.drawText('PII Reqs', { x: colPII, y: headerY, size: FONT_SIZE, font: boldFont, color: rgb(0, 0, 0) });
  ctx.page.drawText('Max Risk', { x: colRisk, y: headerY, size: FONT_SIZE, font: boldFont, color: rgb(0, 0, 0) });
  ctx.y -= LINE_HEIGHT;

  for (const [origin, stats] of siteMap.entries()) {
    ensureSpace(ctx, LINE_HEIGHT);
    const truncatedOrigin = origin.length > 45 ? origin.slice(0, 42) + '...' : origin;
    ctx.page.drawText(truncatedOrigin, { x: colSite, y: ctx.y, size: FONT_SIZE, font, color: rgb(0, 0, 0) });
    ctx.page.drawText(String(stats.count), { x: colReqs, y: ctx.y, size: FONT_SIZE, font, color: rgb(0, 0, 0) });
    ctx.page.drawText(String(stats.piiCount), { x: colPII, y: ctx.y, size: FONT_SIZE, font, color: rgb(0, 0, 0) });
    const riskColor = stats.maxRisk >= 70 ? rgb(0.8, 0, 0) : stats.maxRisk >= 40 ? rgb(0.8, 0.5, 0) : rgb(0, 0.5, 0);
    ctx.page.drawText(String(stats.maxRisk), { x: colRisk, y: ctx.y, size: FONT_SIZE, font, color: riskColor });
    ctx.y -= LINE_HEIGHT;
  }

  ctx.y -= 6;
  drawHRule(ctx);

  // ── Paginated request log ──
  drawText(ctx, 'Request Log', { size: SECTION_SIZE, bold: true });
  ctx.y -= 2;

  const sorted = [...records].sort((a, b) => b.timestampMs - a.timestampMs);

  for (const r of sorted) {
    ensureSpace(ctx, LINE_HEIGHT * 4 + 4);

    // Row background for PII records
    if (r.piiFindings.length > 0) {
      ctx.page.drawRectangle({
        x: MARGIN,
        y: ctx.y - LINE_HEIGHT * 3 + 3,
        width: PAGE_WIDTH - MARGIN * 2,
        height: LINE_HEIGHT * 3,
        color: rgb(1, 0.97, 0.95),
      });
    }

    const ts = new Date(r.timestampMs).toISOString();
    const urlTrunc = r.url.length > 80 ? r.url.slice(0, 77) + '...' : r.url;
    drawText(ctx, `${ts}  ${r.method}  ${r.responseStatusCode}`, { bold: true });
    drawText(ctx, urlTrunc);
    const piiSummary = r.piiFindings.length > 0
      ? `PII: ${r.piiFindings.map((f) => f.type).join(', ')}  Risk: ${r.riskContribution}`
      : `No PII  Risk: ${r.riskContribution}`;
    drawText(ctx, piiSummary, { color: r.piiFindings.length > 0 ? rgb(0.7, 0, 0) : rgb(0.3, 0.3, 0.3) });
    ctx.y -= 4;
  }

  const pdfBytes = await doc.save();
  return new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function exportReport(scope: ExportScope, format: ExportFormat): Promise<void> {
  let records: RequestRecord[];
  try {
    records = await fetchRecords(scope);
  } catch (err) {
    throw new Error(`Failed to fetch records for export: ${err instanceof Error ? err.message : String(err)}`);
  }

  let blob: Blob;
  let name: string;

  try {
    switch (format) {
      case 'json':
        blob = exportJSON(records, scope);
        name = filename('json');
        break;
      case 'csv':
        blob = exportCSV(records);
        name = filename('csv');
        break;
      case 'pdf':
        blob = await exportPDF(records, scope);
        name = filename('pdf');
        break;
      default: {
        const _exhaustive: never = format;
        throw new Error(`Unknown export format: ${_exhaustive}`);
      }
    }
  } catch (err) {
    throw new Error(`Failed to generate ${format} export: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    triggerDownload(blob, name);
  } catch (err) {
    throw new Error(`Failed to trigger download: ${err instanceof Error ? err.message : String(err)}`);
  }
}
