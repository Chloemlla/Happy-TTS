import axios from 'axios';

const getApiBaseUrl = () => {
  if (import.meta.env.DEV) return '';
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  return 'https://tts-api.hapxs.com';
};

const api = axios.create({
  baseURL: getApiBaseUrl(),
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('token')}`
  }
});

export default api; 