import { useState } from 'react';
import axios from 'axios';
import { TtsRequest, TtsResponse } from '../types/tts';

// 创建axios实例
const api = axios.create({
    baseURL: 'https://tts-api.hapxs.com',  // 直接连接到后端服务
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json'
    }
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

      const response = await api.post<TtsResponse>('/api/tts', request);
      setAudioUrl(response.data.audioUrl);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        setError(error.response?.data?.message || '生成语音时发生错误');
      } else {
        setError('生成语音时发生未知错误');
      }
      throw error;
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