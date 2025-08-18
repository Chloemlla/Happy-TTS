import axios, { AxiosInstance } from 'axios';
import { reportFingerprintOnce } from '../utils/fingerprint';

// 获取API基础URL
const getApiBaseUrl = () => {
    if (import.meta.env.DEV) return 'http://localhost:3000';
    if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
    return 'https://api.hapxs.com';
};

// 创建 axios 实例
export const api: AxiosInstance = axios.create({
    baseURL: getApiBaseUrl(),
    headers: {
        'Content-Type': 'application/json',
    },
    withCredentials: true, // 发送跨域凭据（Cookie），用于管理员会话与游客 Cookie
});

// 请求拦截器：添加 token
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// 响应拦截器：处理错误
api.interceptors.response.use(
    (response) => {
        try {
            const flag = response.headers?.['x-require-fingerprint'] || response.headers?.['X-Require-Fingerprint'];
            if (flag === '1') {
                // 异步触发上报（不阻塞当前请求）
                reportFingerprintOnce({ force: true });
            }
        } catch { }
        return response;
    },
    (error) => {
        try {
            const flag = error?.response?.headers?.['x-require-fingerprint'] || error?.response?.headers?.['X-Require-Fingerprint'];
            if (flag === '1') {
                reportFingerprintOnce({ force: true });
            }
        } catch { }
        if (error.response?.status === 401) {
            localStorage.removeItem('token');
            window.location.href = '/welcome';
        }
        return Promise.reject(error);
    }
);

export { getApiBaseUrl };
export default api;