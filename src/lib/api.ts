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
    data.apiVersion ??
    data.serverVersion ??
    data.informationalVersion;
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null;
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
      return extractVersionFromPayload(res.data) || '2.4.0-mock';
    } catch {
      return '2.4.0-mock';
    }
  }

  if (detectedHeaderApiVersion) {
    return detectedHeaderApiVersion;
  }

  const token = localStorage.getItem('grimoire_api_key');
  const trimmed = info.rawUrl.endsWith('/') ? info.rawUrl.slice(0, -1) : info.rawUrl;
  const originBase = trimmed.endsWith('/api/management')
    ? trimmed.slice(0, -'/api/management'.length)
    : trimmed;
  const managementBase = `${originBase}/api/management`;

  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const candidates = [
    `${managementBase}/version`,
    `${originBase}/version`,
    `${originBase}/health`,
  ];

  for (const endpoint of candidates) {
    try {
      const res = await axios.get(endpoint, { headers, timeout: 3000 });
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
    config.baseURL = url.endsWith('/') ? url.slice(0, -1) : url;
    if (!config.baseURL.endsWith('/api/management')) {
      config.baseURL += '/api/management';
    }
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


