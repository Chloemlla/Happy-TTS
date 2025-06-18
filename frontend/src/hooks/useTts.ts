import { useState } from 'react';
import axios, { AxiosError } from 'axios';
import { TtsRequest, TtsResponse } from '../types/tts';

// 创建axios实例
const api = axios.create({
    baseURL: 'https://tts-api.hapxs.com',  // 直接连接到后端服务
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json'
    },
    timeout: 30000 // 设置30秒超时
});

export const useTts = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const generateSpeech = async (request: TtsRequest): Promise<TtsResponse> => {
    try {
      setLoading(true);
      setError(null);
      setAudioUrl(null);

      // 先进行违禁词检测
      const detectResponse = await api.get(`https://v2.xxapi.cn/api/detect?text=${encodeURIComponent(request.text)}`);
      
      if (detectResponse.data.is_prohibited) {
        const errorMessage = '文本包含违禁内容，请修改后重试';
        setError(errorMessage);
        throw new Error(errorMessage);
      }

      const response = await api.post<TtsResponse>('/api/tts', request);
      
      if (response.data && response.data.audioUrl) {
        setAudioUrl(response.data.audioUrl);
        return response.data;
      } else {
        throw new Error('服务器返回数据格式错误');
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        if (axiosError.response) {
          // 服务器返回错误响应
          const errorData = axiosError.response.data as { message?: string; error?: string };
          const errorMessage = errorData?.error || errorData?.message || '服务器错误';
          setError(errorMessage);
          throw new Error(errorMessage);
        } else if (axiosError.request) {
          // 请求发送但没有收到响应
          const errorMessage = `网络连接错误，请检查网络连接\n详细信息: ${JSON.stringify(axiosError.toJSON ? axiosError.toJSON() : axiosError)}`;
          setError(errorMessage);
          throw new Error(errorMessage);
        } else {
          // 请求配置出错
          const errorMessage = '请求配置错误';
          setError(errorMessage);
          throw new Error(errorMessage);
        }
      } else {
        // 其他错误
        const errorMessage = '生成语音时发生未知错误';
        setError(errorMessage);
        throw new Error(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    error,
    audioUrl,
    generateSpeech
  };
}; 