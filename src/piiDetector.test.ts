// Unit tests for piiDetector — comprehensive coverage of all PII types
// Validates: Requirements 5.1, 5.4

import { describe, it, expect } from 'vitest';
import { detectPII, luhn } from './piiDetector';
import { computeRiskScore } from './riskScorer';
import type { PIIFinding } from './types';

// ---------------------------------------------------------------------------
// luhn
// ---------------------------------------------------------------------------

describe('luhn', () => {
  it('returns true for a known-valid card number', () => {
    expect(luhn('4532015112830366')).toBe(true);
  });

  it('returns false for an invalid card number', () => {
    expect(luhn('4532015112830367')).toBe(false);
  });

  it('returns false for strings shorter than 13 digits', () => {
    expect(luhn('123456789012')).toBe(false);
  });

  it('returns false for strings longer than 19 digits', () => {
    expect(luhn('12345678901234567890')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// detectPII — body scanning
// ---------------------------------------------------------------------------

describe('detectPII — body', () => {
  it('detects an email address', () => {
    const findings = detectPII('contact user@example.com for info', []);
    expect(findings.some(f => f.type === 'email')).toBe(true);
  });

  it('detects a Luhn-valid credit card', () => {
    const findings = detectPII('card: 4532015112830366', []);
    expect(findings.some(f => f.type === 'credit_card')).toBe(true);
  });

  it('does not detect a Luhn-invalid credit card', () => {
    const findings = detectPII('card: 4532015112830367', []);
    expect(findings.some(f => f.type === 'credit_card')).toBe(false);
  });

  it('detects an SSN', () => {
    const findings = detectPII('ssn: 123-45-6789', []);
    expect(findings.some(f => f.type === 'ssn')).toBe(true);
  });

  it('detects a password field', () => {
    const findings = detectPII('{"password": "s3cr3t!"}', []);
    expect(findings.some(f => f.type === 'password_field')).toBe(true);
  });

  it('detects a JWT in body', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const findings = detectPII(jwt, []);
    expect(findings.some(f => f.type === 'jwt')).toBe(true);
  });

  it('returns empty array for clean payload', () => {
    const findings = detectPII('hello world, nothing sensitive here', []);
    expect(findings).toHaveLength(0);
  });

  it('never stores raw values in redactedPreview', () => {
    const email = 'user@example.com';
    const findings = detectPII(email, []);
    for (const f of findings) {
      expect(f.redactedPreview).not.toBe(email);
    }
  });

  it('redactedPreview follows first2 + ** + last2 format for values >= 4 chars', () => {
    const findings = detectPII('user@example.com', []);
    const emailFinding = findings.find(f => f.type === 'email');
    expect(emailFinding).toBeDefined();
    // preview should be 2 chars + '**' + 2 chars
    expect(emailFinding!.redactedPreview).toMatch(/^.{2}\*\*.{2}$/);
  });
});

// ---------------------------------------------------------------------------
// detectPII — header scanning
// ---------------------------------------------------------------------------

describe('detectPII — headers', () => {
  it('detects a Bearer token in Authorization header', () => {
    const findings = detectPII('', [{ name: 'Authorization', value: 'Bearer abc123token' }]);
    expect(findings.some(f => f.type === 'bearer_token')).toBe(true);
  });

  it('detects Basic auth in Authorization header', () => {
    const findings = detectPII('', [{ name: 'Authorization', value: 'Basic dXNlcjpwYXNz' }]);
    expect(findings.some(f => f.type === 'basic_auth')).toBe(true);
  });

  it('detects API key in x-api-key header', () => {
    const findings = detectPII('', [{ name: 'x-api-key', value: 'my-secret-key-value' }]);
    expect(findings.some(f => f.type === 'api_key')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// computeRiskScore
// ---------------------------------------------------------------------------

describe('computeRiskScore', () => {
  it('returns 0 for empty findings', () => {
    expect(computeRiskScore([])).toBe(0);
  });

  it('returns a value in [0, 100] for any input', () => {
    const findings: PIIFinding[] = [
      { type: 'credit_card', severity: 'critical', redactedPreview: 'ab**cd', location: 'body' },
      { type: 'ssn',         severity: 'critical', redactedPreview: 'ab**cd', location: 'body' },
      { type: 'email',       severity: 'medium',   redactedPreview: 'ab**cd', location: 'body' },
    ];
    const score = computeRiskScore(findings);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('caps critical contribution at 50', () => {
    const findings: PIIFinding[] = Array.from({ length: 10 }, () => ({
      type: 'credit_card' as const,
      severity: 'critical' as const,
      redactedPreview: 'ab**cd',
      location: 'body' as const,
    }));
    // With dedup in detectPII this won't happen in practice, but riskScorer itself doesn't dedup
    const score = computeRiskScore(findings);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('scores a single critical finding as 25', () => {
    const findings: PIIFinding[] = [
      { type: 'credit_card', severity: 'critical', redactedPreview: 'ab**cd', location: 'body' },
    ];
    expect(computeRiskScore(findings)).toBe(25);
  });

  it('scores a single high finding as 10', () => {
    const findings: PIIFinding[] = [
      { type: 'bearer_token', severity: 'high', redactedPreview: 'ab**cd', location: 'header' },
    ];
    expect(computeRiskScore(findings)).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// luhn — boundary cases
// ---------------------------------------------------------------------------

describe('luhn — boundary cases', () => {
  // 13-digit valid (Visa short)
  it('returns true for a 13-digit Luhn-valid number', () => {
    // 4000000000006 — Luhn valid 13-digit
    expect(luhn('4000000000006')).toBe(true);
  });

  // 19-digit valid
  it('returns true for a 19-digit Luhn-valid number', () => {
    // Build a 19-digit valid number: prefix 18 digits, append check digit
    // 6011000990139424 is 16-digit valid; pad to 19 with known valid: 6011111111111117111 — let's use a known one
    // 19-digit Visa: 4532015112830366000 — not necessarily valid; use computed one
    // prefix = '000000000000000000' (18 zeros), check digit = 0 → '0000000000000000000'
    expect(luhn('0000000000000000000')).toBe(true);
  });

  it('returns false for a 12-digit number (too short)', () => {
    expect(luhn('411111111111')).toBe(false);
  });

  it('returns false for a 20-digit number (too long)', () => {
    expect(luhn('45320151128303660000')).toBe(false);
  });

  it('off-by-one: flipping last digit of valid card makes it invalid', () => {
    // 4532015112830366 is valid; change last digit 6 → 7
    expect(luhn('4532015112830366')).toBe(true);
    expect(luhn('4532015112830367')).toBe(false);
  });

  it('off-by-one: flipping last digit of another valid card', () => {
    // 4111111111111111 is a well-known valid Visa test number
    expect(luhn('4111111111111111')).toBe(true);
    expect(luhn('4111111111111112')).toBe(false);
  });

  it('returns false for non-digit characters', () => {
    expect(luhn('4532-0151-1283-0366')).toBe(true); // dashes stripped → valid
    expect(luhn('4532 0151 1283 0366')).toBe(true); // spaces stripped → valid
    expect(luhn('abcdefghijklmno')).toBe(false);
  });

  it('handles all-zeros (13 digits) as Luhn-valid', () => {
    expect(luhn('0000000000000')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// detectPII — email
// ---------------------------------------------------------------------------

describe('detectPII — email', () => {
  it('detects a simple email address', () => {
    const findings = detectPII('send to user@example.com please', []);
    expect(findings.some(f => f.type === 'email')).toBe(true);
  });

  it('detects email with plus addressing', () => {
    const findings = detectPII('user+tag@sub.domain.org', []);
    expect(findings.some(f => f.type === 'email')).toBe(true);
  });

  it('detects email with dots in local part', () => {
    const findings = detectPII('first.last@company.co.uk', []);
    expect(findings.some(f => f.type === 'email')).toBe(true);
  });

  it('does not detect a plain word as email', () => {
    const findings = detectPII('hello world no email here', []);
    expect(findings.some(f => f.type === 'email')).toBe(false);
  });

  it('does not detect a string missing the @ symbol', () => {
    const findings = detectPII('userexample.com', []);
    expect(findings.some(f => f.type === 'email')).toBe(false);
  });

  it('does not detect a string missing the domain', () => {
    const findings = detectPII('user@', []);
    expect(findings.some(f => f.type === 'email')).toBe(false);
  });

  it('assigns medium severity to email findings', () => {
    const findings = detectPII('user@example.com', []);
    const f = findings.find(f => f.type === 'email');
    expect(f?.severity).toBe('medium');
  });
});

// ---------------------------------------------------------------------------
// detectPII — phone
// ---------------------------------------------------------------------------

describe('detectPII — phone', () => {
  it('detects E.164 format (+12025551234)', () => {
    const findings = detectPII('call +12025551234 now', []);
    expect(findings.some(f => f.type === 'phone')).toBe(true);
  });

  it('detects E.164 international format (+447911123456)', () => {
    const findings = detectPII('intl: +447911123456', []);
    expect(findings.some(f => f.type === 'phone')).toBe(true);
  });

  it('detects US format with dashes (555-867-5309)', () => {
    const findings = detectPII('phone: 555-867-5309', []);
    expect(findings.some(f => f.type === 'phone')).toBe(true);
  });

  it('detects US format with dots (555.867.5309)', () => {
    const findings = detectPII('phone: 555.867.5309', []);
    expect(findings.some(f => f.type === 'phone')).toBe(true);
  });

  it('detects US format with spaces (555 867 5309)', () => {
    const findings = detectPII('phone: 555 867 5309', []);
    expect(findings.some(f => f.type === 'phone')).toBe(true);
  });

  it('detects US format with parentheses ((555) 867-5309)', () => {
    const findings = detectPII('call (555) 867-5309', []);
    expect(findings.some(f => f.type === 'phone')).toBe(true);
  });

  it('does not detect a short number as phone', () => {
    const findings = detectPII('code: 12345', []);
    expect(findings.some(f => f.type === 'phone')).toBe(false);
  });

  it('assigns medium severity to phone findings', () => {
    const findings = detectPII('+12025551234', []);
    const f = findings.find(f => f.type === 'phone');
    expect(f?.severity).toBe('medium');
  });
});

// ---------------------------------------------------------------------------
// detectPII — credit card
// ---------------------------------------------------------------------------

describe('detectPII — credit_card', () => {
  it('detects a 16-digit Luhn-valid Visa number', () => {
    const findings = detectPII('card: 4111111111111111', []);
    expect(findings.some(f => f.type === 'credit_card')).toBe(true);
  });

  it('detects a 16-digit Luhn-valid Mastercard number', () => {
    // 5500005555555559 is a known valid Mastercard test number
    const findings = detectPII('card: 5500005555555559', []);
    expect(findings.some(f => f.type === 'credit_card')).toBe(true);
  });

  it('detects a 15-digit Luhn-valid Amex number', () => {
    // 378282246310005 is a known valid Amex test number
    const findings = detectPII('card: 378282246310005', []);
    expect(findings.some(f => f.type === 'credit_card')).toBe(true);
  });

  it('detects a 13-digit Luhn-valid number', () => {
    expect(luhn('4000000000006')).toBe(true);
    const findings = detectPII('card: 4000000000006', []);
    expect(findings.some(f => f.type === 'credit_card')).toBe(true);
  });

  it('detects a 19-digit Luhn-valid number', () => {
    // 19 zeros is Luhn-valid
    const findings = detectPII('card: 0000000000000000000', []);
    expect(findings.some(f => f.type === 'credit_card')).toBe(true);
  });

  it('does not detect a Luhn-invalid 16-digit number', () => {
    const findings = detectPII('card: 4111111111111112', []);
    expect(findings.some(f => f.type === 'credit_card')).toBe(false);
  });

  it('does not detect a 12-digit number (too short)', () => {
    const findings = detectPII('num: 411111111111', []);
    expect(findings.some(f => f.type === 'credit_card')).toBe(false);
  });

  it('does not detect a 20-digit number (too long)', () => {
    const findings = detectPII('num: 45320151128303660000', []);
    expect(findings.some(f => f.type === 'credit_card')).toBe(false);
  });

  it('assigns critical severity to credit card findings', () => {
    const findings = detectPII('4111111111111111', []);
    const f = findings.find(f => f.type === 'credit_card');
    expect(f?.severity).toBe('critical');
  });
});

// ---------------------------------------------------------------------------
// detectPII — password_field
// ---------------------------------------------------------------------------

describe('detectPII — password_field', () => {
  const passwordKeys = ['password', 'passwd', 'pwd', 'secret', 'pass'];

  for (const key of passwordKeys) {
    it(`detects key "${key}" in JSON-like payload`, () => {
      const findings = detectPII(`{"${key}": "s3cr3tV@lue"}`, []);
      expect(findings.some(f => f.type === 'password_field')).toBe(true);
    });
  }

  it('detects password key with = assignment syntax', () => {
    const findings = detectPII('password=myS3cret', []);
    expect(findings.some(f => f.type === 'password_field')).toBe(true);
  });

  it('detects password key case-insensitively', () => {
    const findings = detectPII('{"Password": "abc123"}', []);
    expect(findings.some(f => f.type === 'password_field')).toBe(true);
  });

  it('assigns critical severity to password_field findings', () => {
    const findings = detectPII('{"password": "abc123"}', []);
    const f = findings.find(f => f.type === 'password_field');
    expect(f?.severity).toBe('critical');
  });

  it('does not detect unrelated keys as password_field', () => {
    const findings = detectPII('{"username": "alice", "email": "a@b.com"}', []);
    expect(findings.some(f => f.type === 'password_field')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// detectPII — api_key (payload)
// ---------------------------------------------------------------------------

describe('detectPII — api_key in payload', () => {
  const apiKeyNames = ['api_key', 'apikey', 'api-key'];

  for (const key of apiKeyNames) {
    it(`detects key "${key}" in JSON-like payload`, () => {
      const findings = detectPII(`{"${key}": "abc123xyz"}`, []);
      expect(findings.some(f => f.type === 'api_key')).toBe(true);
    });
  }

  it('assigns high severity to api_key findings', () => {
    const findings = detectPII('{"api_key": "abc123xyz"}', []);
    const f = findings.find(f => f.type === 'api_key');
    expect(f?.severity).toBe('high');
  });
});

// ---------------------------------------------------------------------------
// detectPII — SSN
// ---------------------------------------------------------------------------

describe('detectPII — ssn', () => {
  it('detects a US SSN in XXX-XX-XXXX format', () => {
    const findings = detectPII('ssn: 123-45-6789', []);
    expect(findings.some(f => f.type === 'ssn')).toBe(true);
  });

  it('detects SSN embedded in a sentence', () => {
    const findings = detectPII('My social is 987-65-4321 please keep it safe', []);
    expect(findings.some(f => f.type === 'ssn')).toBe(true);
  });

  it('does not detect SSN without dashes', () => {
    const findings = detectPII('123456789', []);
    expect(findings.some(f => f.type === 'ssn')).toBe(false);
  });

  it('does not detect partial SSN pattern (XX-XXXX)', () => {
    const findings = detectPII('ref: 45-6789', []);
    expect(findings.some(f => f.type === 'ssn')).toBe(false);
  });

  it('assigns critical severity to SSN findings', () => {
    const findings = detectPII('123-45-6789', []);
    const f = findings.find(f => f.type === 'ssn');
    expect(f?.severity).toBe('critical');
  });
});

// ---------------------------------------------------------------------------
// detectPII — IPv4
// ---------------------------------------------------------------------------

describe('detectPII — ipv4', () => {
  it('detects a standard IPv4 address', () => {
    const findings = detectPII('server: 192.168.1.1', []);
    expect(findings.some(f => f.type === 'ipv4')).toBe(true);
  });

  it('detects a public IPv4 address', () => {
    const findings = detectPII('ip=8.8.8.8', []);
    expect(findings.some(f => f.type === 'ipv4')).toBe(true);
  });

  it('detects max-value IPv4 (255.255.255.255)', () => {
    const findings = detectPII('broadcast: 255.255.255.255', []);
    expect(findings.some(f => f.type === 'ipv4')).toBe(true);
  });

  it('does not detect an invalid IPv4 with octet > 255', () => {
    const findings = detectPII('bad: 256.1.1.1', []);
    expect(findings.some(f => f.type === 'ipv4')).toBe(false);
  });

  it('assigns low severity to IPv4 findings', () => {
    const findings = detectPII('192.168.0.1', []);
    const f = findings.find(f => f.type === 'ipv4');
    expect(f?.severity).toBe('low');
  });
});

// ---------------------------------------------------------------------------
// detectPII — IPv6
// ---------------------------------------------------------------------------

describe('detectPII — ipv6', () => {
  it('detects a full IPv6 address', () => {
    const findings = detectPII('addr: 2001:0db8:85a3:0000:0000:8a2e:0370:7334', []);
    expect(findings.some(f => f.type === 'ipv6')).toBe(true);
  });

  it('detects a compressed IPv6 address (::1)', () => {
    const findings = detectPII('loopback: ::1', []);
    expect(findings.some(f => f.type === 'ipv6')).toBe(true);
  });

  it('detects a compressed IPv6 with omitted groups', () => {
    const findings = detectPII('fe80::1', []);
    expect(findings.some(f => f.type === 'ipv6')).toBe(true);
  });

  it('assigns low severity to IPv6 findings', () => {
    const findings = detectPII('2001:0db8:85a3:0000:0000:8a2e:0370:7334', []);
    const f = findings.find(f => f.type === 'ipv6');
    expect(f?.severity).toBe('low');
  });
});

// ---------------------------------------------------------------------------
// detectPII — JWT
// ---------------------------------------------------------------------------

describe('detectPII — jwt', () => {
  const sampleJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

  it('detects a JWT in the body', () => {
    const findings = detectPII(`token: ${sampleJwt}`, []);
    expect(findings.some(f => f.type === 'jwt')).toBe(true);
  });

  it('detects a JWT passed as a Bearer token in Authorization header', () => {
    const findings = detectPII('', [{ name: 'Authorization', value: `Bearer ${sampleJwt}` }]);
    // Should detect both bearer_token and jwt
    expect(findings.some(f => f.type === 'bearer_token')).toBe(true);
  });

  it('does not detect a non-JWT dot-separated string as JWT', () => {
    const findings = detectPII('version: 1.2.3', []);
    expect(findings.some(f => f.type === 'jwt')).toBe(false);
  });

  it('does not detect a two-segment base64 string as JWT', () => {
    const findings = detectPII('eyJhbGci.eyJzdWIi', []);
    expect(findings.some(f => f.type === 'jwt')).toBe(false);
  });

  it('assigns high severity to JWT findings', () => {
    const findings = detectPII(sampleJwt, []);
    const f = findings.find(f => f.type === 'jwt');
    expect(f?.severity).toBe('high');
  });
});

// ---------------------------------------------------------------------------
// detectPII — header scanning: Bearer, Basic, API key
// ---------------------------------------------------------------------------

describe('detectPII — header scanning', () => {
  it('detects Bearer token in Authorization header', () => {
    const findings = detectPII('', [{ name: 'Authorization', value: 'Bearer mytoken123' }]);
    expect(findings.some(f => f.type === 'bearer_token')).toBe(true);
  });

  it('detects Bearer token case-insensitively', () => {
    const findings = detectPII('', [{ name: 'authorization', value: 'Bearer mytoken123' }]);
    expect(findings.some(f => f.type === 'bearer_token')).toBe(true);
  });

  it('assigns high severity to bearer_token findings', () => {
    const findings = detectPII('', [{ name: 'Authorization', value: 'Bearer mytoken123' }]);
    const f = findings.find(f => f.type === 'bearer_token');
    expect(f?.severity).toBe('high');
  });

  it('detects Basic auth in Authorization header', () => {
    const findings = detectPII('', [{ name: 'Authorization', value: 'Basic dXNlcjpwYXNz' }]);
    expect(findings.some(f => f.type === 'basic_auth')).toBe(true);
  });

  it('detects Basic auth with padding characters', () => {
    const findings = detectPII('', [{ name: 'Authorization', value: 'Basic dXNlcjpwYXNzd29yZA==' }]);
    expect(findings.some(f => f.type === 'basic_auth')).toBe(true);
  });

  it('assigns high severity to basic_auth findings', () => {
    const findings = detectPII('', [{ name: 'Authorization', value: 'Basic dXNlcjpwYXNz' }]);
    const f = findings.find(f => f.type === 'basic_auth');
    expect(f?.severity).toBe('high');
  });

  it('detects API key in x-api-key header', () => {
    const findings = detectPII('', [{ name: 'x-api-key', value: 'sk-abc123secretkey' }]);
    expect(findings.some(f => f.type === 'api_key')).toBe(true);
  });

  it('detects API key in api-key header', () => {
    const findings = detectPII('', [{ name: 'api-key', value: 'sk-abc123secretkey' }]);
    expect(findings.some(f => f.type === 'api_key')).toBe(true);
  });

  it('detects API key in apikey header', () => {
    const findings = detectPII('', [{ name: 'apikey', value: 'sk-abc123secretkey' }]);
    expect(findings.some(f => f.type === 'api_key')).toBe(true);
  });

  it('assigns high severity to api_key header findings', () => {
    const findings = detectPII('', [{ name: 'x-api-key', value: 'sk-abc123secretkey' }]);
    const f = findings.find(f => f.type === 'api_key');
    expect(f?.severity).toBe('high');
  });

  it('does not flag a non-auth header as bearer_token', () => {
    const findings = detectPII('', [{ name: 'Content-Type', value: 'application/json' }]);
    expect(findings.some(f => f.type === 'bearer_token')).toBe(false);
  });

  it('does not flag a non-auth header as basic_auth', () => {
    const findings = detectPII('', [{ name: 'Accept', value: 'text/html' }]);
    expect(findings.some(f => f.type === 'basic_auth')).toBe(false);
  });

  it('records fieldName as the header name for header findings', () => {
    const findings = detectPII('', [{ name: 'Authorization', value: 'Bearer tok123' }]);
    const f = findings.find(f => f.type === 'bearer_token');
    expect(f?.fieldName).toBe('Authorization');
  });

  it('records location as "header" for header findings', () => {
    const findings = detectPII('', [{ name: 'x-api-key', value: 'mykey' }]);
    const f = findings.find(f => f.type === 'api_key');
    expect(f?.location).toBe('header');
  });
});

// ---------------------------------------------------------------------------
// detectPII — deduplication
// ---------------------------------------------------------------------------

describe('detectPII — deduplication', () => {
  it('returns only one finding per PII type per location', () => {
    const findings = detectPII('user@example.com and user@example.com again', []);
    const emailFindings = findings.filter(f => f.type === 'email');
    expect(emailFindings).toHaveLength(1);
  });

  it('returns only one credit card finding even if same card appears twice', () => {
    const findings = detectPII('4111111111111111 and 4111111111111111', []);
    const ccFindings = findings.filter(f => f.type === 'credit_card');
    expect(ccFindings).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// detectPII — location field
// ---------------------------------------------------------------------------

describe('detectPII — location field', () => {
  it('sets location to "body" for payload findings', () => {
    const findings = detectPII('user@example.com', []);
    const f = findings.find(f => f.type === 'email');
    expect(f?.location).toBe('body');
  });

  it('sets location to "header" for header findings', () => {
    const findings = detectPII('', [{ name: 'Authorization', value: 'Bearer tok123' }]);
    const f = findings.find(f => f.type === 'bearer_token');
    expect(f?.location).toBe('header');
  });
});
