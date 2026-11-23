import axios from 'axios';
import { mockApiAdapter } from './mockApi';

export const UI_VERSION = (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '2.4.0').replace(/^v/i, '');

export const api = axios.create({
  baseURL: localStorage.getItem('grimoire_api_url') || 'http://localhost:5000',
});

const isTestMode =
  (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') ||
  (typeof window !== 'undefined' && ((window as any).__MOCK_API__ === true));

let detectedHeaderApiVersion: string | null = null;

export function clearDetectedApiVersion() {
  detectedHeaderApiVersion = null;
}

/**
 * Extracts the one-time plain API key from a create-application or rotate-key response.
 * The Grimoire API returns it as `plainApiKey`; `apiKey`/`key` are accepted for backwards compatibility.
 */
export function extractPlainApiKey(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const payload = data as Record<string, unknown>;
  const candidate = payload.plainApiKey ?? payload.apiKey ?? payload.key;
  return typeof candidate === 'string' && candidate.trim() !== '' ? candidate : null;
}

export function toApiDateTime(value?: string | null): string | null {
  if (!value || !value.trim()) return null;
  const trimmed = value.trim();
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    ? new Date(`${trimmed}T00:00:00.000Z`)
    : new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function extractVersionFromHeaders(headers: Record<string, any> | undefined): string | null {
  if (!headers) return null;
  const candidate =
    headers['x-api-version'] ||
    headers['x-grimoire-version'] ||
    headers['x-version'] ||
    headers['api-version'];
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null;
}

function extractVersionFromPayload(data: any): string | null {
  if (!data || typeof data !== 'object') return null;
  const candidate =
    data.version ??
    data.info?.version ??
    data.apiVersion ??
    data.serverVersion ??
    data.informationalVersion;
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null;
}

function stripManagementSuffix(url: string): string {
  const trimmed = url.endsWith('/') ? url.slice(0, -1) : url;
  if (trimmed.endsWith('/api/management')) {
    return trimmed.slice(0, -'/api/management'.length);
  }
  if (trimmed.endsWith('/management')) {
    return trimmed.slice(0, -'/management'.length);
  }
  return trimmed;
}

export const UI_REPOSITORY_URL = 'https://github.com/guibranco/grimoire-ui';
export const API_REPOSITORY_URL = 'https://github.com/guibranco/grimoire-api';

/**
 * Where the sidebar's API version links to: the connected server's Swagger UI
 * (served at `/swagger` on the API origin). The mock API has no docs of its own,
 * so it points at the API repository instead.
 */
export function getApiDocsUrl(): string {
  const info = getApiConnectionInfo();
  if (info.isMock) {
    return API_REPOSITORY_URL;
  }
  const origin = stripManagementSuffix(info.rawUrl.trim());
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(origin)) {
    return `${origin}/swagger`;
  }
  // A relative base (e.g. `/api/management`) is served from the UI's own origin.
  if (origin === '' || origin.startsWith('/')) {
    return new URL(`${origin}/swagger`, window.location.origin).toString();
  }
  return `https://${origin}/swagger`;
}

export interface ApiConnectionInfo {
  isMock: boolean;
  label: string;
  rawUrl: string;
}

export function getApiConnectionInfo(): ApiConnectionInfo {
  const storedUrl = localStorage.getItem('grimoire_api_url')?.trim();
  const forceMock = typeof window !== 'undefined' && (window as any).__MOCK_API__ === true;

  if (storedUrl === 'mock://' || forceMock || (!storedUrl && isTestMode)) {
    return {
      isMock: true,
      label: 'MOCK',
      rawUrl: storedUrl || 'mock://',
    };
  }

  const rawUrl = storedUrl || 'http://localhost:5000';
  try {
    const normalized = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    const parsed = new URL(normalized);
    return {
      isMock: false,
      label: parsed.host || rawUrl,
      rawUrl,
    };
  } catch {
    const fallbackHost = rawUrl.replace(/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//, '').split('/')[0];
    return {
      isMock: false,
      label: fallbackHost || rawUrl,
      rawUrl,
    };
  }
}

export async function fetchApiVersion(): Promise<string | null> {
  const info = getApiConnectionInfo();

  if (info.isMock) {
    try {
      const res = await api.get('/version');
      return extractVersionFromPayload(res.data) || '1.2.0-mock';
    } catch {
      return '1.2.0-mock';
    }
  }

  if (detectedHeaderApiVersion) {
    return detectedHeaderApiVersion;
  }

  const token = localStorage.getItem('grimoire_api_key');
  const originBase = stripManagementSuffix(info.rawUrl);
  const managementBase = `${originBase}/management`;

  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const candidates: Array<{ url: string; withAuth: boolean }> = [
    { url: `${originBase}/health`, withAuth: false },
    { url: `${originBase}/swagger/management/swagger.json`, withAuth: false },
    { url: `${originBase}/swagger/v1/swagger.json`, withAuth: false },
    { url: `${managementBase}/version`, withAuth: true },
    { url: `${originBase}/version`, withAuth: false },
  ];

  for (const candidate of candidates) {
    try {
      const res = await axios.get(candidate.url, {
        headers: candidate.withAuth ? headers : undefined,
        timeout: 3000,
      });
      const version =
        extractVersionFromPayload(res.data) ||
        extractVersionFromHeaders(res.headers as Record<string, any>);
      if (version) {
        return version;
      }
    } catch {
      // Probe next candidate silently
    }
  }

  return detectedHeaderApiVersion;
}

api.interceptors.request.use((config) => {
  const url = localStorage.getItem('grimoire_api_url');
  const token = localStorage.getItem('grimoire_api_key');

  if (url === 'mock://' || isTestMode) {
    config.adapter = mockApiAdapter;
  } else if (url) {
    const sanitized = url.endsWith('/') ? url.slice(0, -1) : url;
    config.baseURL = sanitized.endsWith('/management') ? sanitized : `${sanitized}/management`;
  } else {
    config.baseURL = 'http://localhost:5000/management';
  }

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    const headerVersion = extractVersionFromHeaders(response.headers as Record<string, any>);
    if (headerVersion) {
      detectedHeaderApiVersion = headerVersion;
    }
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      // Potentially clear token or trigger setup screen
    }
    return Promise.reject(error);
  }
);



