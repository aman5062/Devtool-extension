// PII Detector — pure function module, no I/O, no side effects
// Requirements: 5.1, 5.2, 5.3, 5.4, 5.5

import type { Header, PIIFinding, PIIType, PIISeverity } from './types';

// ---------------------------------------------------------------------------
// Severity mapping
// ---------------------------------------------------------------------------

const SEVERITY_MAP: Record<PIIType, PIISeverity> = {
  credit_card:    'critical',
  ssn:            'critical',
  password_field: 'critical',
  bearer_token:   'high',
  jwt:            'high',
  basic_auth:     'high',
  api_key:        'high',
  email:          'medium',
  phone:          'medium',
  ipv4:           'low',
  ipv6:           'low',
};

// ---------------------------------------------------------------------------
// Regex patterns
// ---------------------------------------------------------------------------

// Email — RFC-ish
const EMAIL_RE = /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g;

// Phone — E.164 (+1234567890) and common US formats
const PHONE_RE = /(?:\+\d{7,15}|\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b|\(\d{3}\)\s*\d{3}[-.\s]\d{4})/g;

// Credit card — 13–19 digit sequences with optional spaces/dashes between groups
const CC_RE = /\b(?:\d[ \-]?){12,18}\d\b/g;

// SSN — xxx-xx-xxxx
const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/g;

// IPv4
const IPV4_RE = /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g;

// IPv6 — standard colon-hex (full and compressed forms)
const IPV6_RE = /(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,7}:|(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|::(?:[0-9a-fA-F]{1,4}:){0,5}[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,5}(?::[0-9a-fA-F]{1,4}){1,2}|(?:[0-9a-fA-F]{1,4}:){1,4}(?::[0-9a-fA-F]{1,4}){1,3}|(?:[0-9a-fA-F]{1,4}:){1,3}(?::[0-9a-fA-F]{1,4}){1,4}|(?:[0-9a-fA-F]{1,4}:){1,2}(?::[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:(?::[0-9a-fA-F]{1,4}){1,6}|:(?::[0-9a-fA-F]{1,4}){1,7}|::/g;

// JWT — three base64url segments separated by dots
const JWT_RE = /\beyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\b/g;

// Bearer token in Authorization header value
const BEARER_RE = /\bBearer\s+([A-Za-z0-9\-._~+/]+=*)/gi;

// Basic auth in Authorization header value
const BASIC_RE = /\bBasic\s+([A-Za-z0-9+/]+=*)/gi;

// Password field key names in JSON payloads (case-insensitive key match)
const PASSWORD_KEY_RE = /["']?\b(password|passwd|pwd|secret|pass)\b["']?\s*[:=]\s*["']?([^"',}\s]+)["']?/gi;

// API key field names in JSON payloads
const API_KEY_PAYLOAD_RE = /["']?\b(api_key|apikey|api-key|x-api-key)\b["']?\s*[:=]\s*["']?([^"',}\s]+)["']?/gi;

// ---------------------------------------------------------------------------
// Luhn algorithm
// ---------------------------------------------------------------------------

export function luhn(digits: string): boolean {
  const cleaned = digits.replace(/[ \-]/g, '');
  if (!/^\d+$/.test(cleaned) || cleaned.length < 13 || cleaned.length > 19) return false;

  let sum = 0;
  let alternate = false;
  for (let i = cleaned.length - 1; i >= 0; i--) {
    let n = parseInt(cleaned[i], 10);
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

// ---------------------------------------------------------------------------
// Redacted preview helper
// ---------------------------------------------------------------------------

function redact(value: string): string {
  if (value.length < 4) return '****';
  return value.slice(0, 2) + '**' + value.slice(-2);
}

// ---------------------------------------------------------------------------
// Deduplication key
// ---------------------------------------------------------------------------

function dedupKey(type: PIIType, location: 'body' | 'header', fieldName?: string): string {
  return `${type}|${location}|${fieldName ?? ''}`;
}

// ---------------------------------------------------------------------------
// detectPII — main export
// ---------------------------------------------------------------------------

/**
 * Scans a payload string and an array of headers for PII.
 * Returns deduplicated PIIFinding[] — raw values are never stored.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
 */
export function detectPII(payload: string, headers: Header[]): PIIFinding[] {
  const seen = new Set<string>();
  const findings: PIIFinding[] = [];

  function add(type: PIIType, location: 'body' | 'header', rawValue: string, fieldName?: string): void {
    const key = dedupKey(type, location, fieldName);
    if (seen.has(key)) return;
    seen.add(key);
    findings.push({
      type,
      severity: SEVERITY_MAP[type],
      redactedPreview: redact(rawValue),
      location,
      fieldName,
    });
  }

  // -------------------------------------------------------------------------
  // Scan payload (body)
  // -------------------------------------------------------------------------

  // Email
  for (const m of payload.matchAll(EMAIL_RE)) {
    add('email', 'body', m[0]);
  }

  // Phone
  for (const m of payload.matchAll(PHONE_RE)) {
    add('phone', 'body', m[0]);
  }

  // Credit card (Luhn-validated)
  for (const m of payload.matchAll(CC_RE)) {
    if (luhn(m[0])) {
      add('credit_card', 'body', m[0]);
    }
  }

  // SSN
  for (const m of payload.matchAll(SSN_RE)) {
    add('ssn', 'body', m[0]);
  }

  // IPv4
  for (const m of payload.matchAll(IPV4_RE)) {
    add('ipv4', 'body', m[0]);
  }

  // IPv6
  for (const m of payload.matchAll(IPV6_RE)) {
    add('ipv6', 'body', m[0]);
  }

  // JWT in payload
  for (const m of payload.matchAll(JWT_RE)) {
    add('jwt', 'body', m[0]);
  }

  // Password field key names in payload
  for (const m of payload.matchAll(PASSWORD_KEY_RE)) {
    const fieldName = m[1];
    const value = m[2];
    add('password_field', 'body', value, fieldName);
  }

  // API key field names in payload
  for (const m of payload.matchAll(API_KEY_PAYLOAD_RE)) {
    const fieldName = m[1];
    const value = m[2];
    add('api_key', 'body', value, fieldName);
  }

  // -------------------------------------------------------------------------
  // Scan headers
  // -------------------------------------------------------------------------

  for (const header of headers) {
    const nameLower = header.name.toLowerCase();
    const value = header.value;

    if (nameLower === 'authorization') {
      // Bearer token
      for (const m of value.matchAll(BEARER_RE)) {
        add('bearer_token', 'header', m[1], header.name);
      }

      // Basic auth
      for (const m of value.matchAll(BASIC_RE)) {
        add('basic_auth', 'header', m[1], header.name);
      }

      // JWT inside Authorization header (e.g. Bearer <jwt>)
      for (const m of value.matchAll(JWT_RE)) {
        add('jwt', 'header', m[0], header.name);
      }
    }

    // API key header names (x-api-key, etc.)
    if (/^(api[_\-]?key|x-api-key|apikey)$/i.test(nameLower)) {
      add('api_key', 'header', value, header.name);
    }
  }

  return findings;
}
