// Shared TypeScript types for Browser Network Privacy Monitor
// Requirements: 1.2, 5.1, 5.5, 6.1

export interface Header {
  name: string;
  value: string;
}

export interface CapturedRequest {
  requestId: string;
  tabId: number;
  url: string;
  method: string;
  requestHeaders: Header[];
  responseHeaders: Header[];
  requestBody: string | null;
  statusCode: number;
  timestampMs: number;
  truncated: boolean;
  bodyUnavailable: boolean;
  decodeError: boolean;
  initiator?: string;
}

export type PIIType =
  | 'email'
  | 'phone'
  | 'credit_card'
  | 'password_field'
  | 'ssn'
  | 'ipv4'
  | 'ipv6'
  | 'jwt'
  | 'bearer_token'
  | 'basic_auth'
  | 'api_key';

export type PIISeverity = 'critical' | 'high' | 'medium' | 'low';

export interface PIIFinding {
  type: PIIType;
  severity: PIISeverity;
  redactedPreview: string;
  location: 'body' | 'header';
  fieldName?: string;
}

export interface RequestRecord {
  id: string; // uuid
  origin: string;
  url: string;
  method: string;
  requestHeaders: Header[];
  responseHeaders: Header[];
  requestBody: string | null;
  responseStatusCode: number;
  timestampMs: number;
  piiFindings: PIIFinding[];
  riskContribution: number;
  truncated: boolean;
  bodyUnavailable: boolean;
  decodeError: boolean;
  resourceType?: string;
  initiator?: string;
  tabId?: number;
}

export interface Preferences {
  globalMonitoringEnabled: boolean;
  disabledSites: string[];
  autoCapture: boolean;
  enableShield: boolean;
  detectPII: boolean;
  showNotifications: boolean;
  darkMode: boolean;
}

export type SiteRiskScore = Record<string, number>;

export interface OriginSummary {
  origin: string;
  requestCount: number;
  lastActivityMs: number;
  riskScore: number;
}

export interface ExportScope {
  scope: 'all' | 'site';
  origin?: string;
}

export type ExportFormat = 'json' | 'csv' | 'pdf';
