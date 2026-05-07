import axios from 'axios';

export const api = axios.create({
  baseURL: localStorage.getItem('grimoire_api_url') || 'http://localhost:5000',
});

api.interceptors.request.use((config) => {
  const url = localStorage.getItem('grimoire_api_url');
  const token = localStorage.getItem('grimoire_api_key');
  
  if (url) {
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
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Potentially clear token or trigger setup screen
    }
    return Promise.reject(error);
  }
);
