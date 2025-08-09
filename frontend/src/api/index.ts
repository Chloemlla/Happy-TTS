import axios from 'axios';

export const getApiBaseUrl = () => {
  if (import.meta.env.DEV) return 'http://localhost:3000';
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  return 'https://api.hapxs.com';
};

const api = axios.create({
  baseURL: getApiBaseUrl(),
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('token')}`
  }
});

export { api };
export default getApiBaseUrl; 