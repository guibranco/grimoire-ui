import axios from 'axios';

const API_BASE_URL = 'http://localhost:5000/api/management';

export const api = axios.create({
  baseURL: API_BASE_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('grimoire_admin_key');
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
      // localStorage.removeItem('grimoire_admin_key');
      // window.location.reload();
    }
    return Promise.reject(error);
  }
);
