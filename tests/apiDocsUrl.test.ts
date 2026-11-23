import { describe, it, expect, afterEach } from 'vitest';
import { API_REPOSITORY_URL, getApiDocsUrl } from '../src/lib/api';

describe('getApiDocsUrl', () => {
  afterEach(() => {
    localStorage.removeItem('grimoire_api_url');
  });

  it('points at the Swagger UI on the API origin', () => {
    localStorage.setItem('grimoire_api_url', 'https://api.grimoire.example.com');
    expect(getApiDocsUrl()).toBe('https://api.grimoire.example.com/swagger');
  });

  it('strips the management suffix and trailing slash', () => {
    localStorage.setItem('grimoire_api_url', 'https://api.grimoire.example.com/api/management/');
    expect(getApiDocsUrl()).toBe('https://api.grimoire.example.com/swagger');

    localStorage.setItem('grimoire_api_url', 'http://localhost:5000/management');
    expect(getApiDocsUrl()).toBe('http://localhost:5000/swagger');
  });

  it('adds https when the stored URL has no scheme', () => {
    localStorage.setItem('grimoire_api_url', 'api.grimoire.example.com');
    expect(getApiDocsUrl()).toBe('https://api.grimoire.example.com/swagger');
  });

  it('links to the API repository when connected to the mock API', () => {
    localStorage.setItem('grimoire_api_url', 'mock://');
    expect(getApiDocsUrl()).toBe(API_REPOSITORY_URL);
  });
});
