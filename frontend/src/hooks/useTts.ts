import { useState } from 'react';
import axios from 'axios';
import { TtsRequest, TtsResponse } from '../types/tts';

export const useTts = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const generateSpeech = async (request: TtsRequest): Promise<TtsResponse> => {
    try {
      setLoading(true);
      setError(null);
      setAudioUrl(null);

      const response = await axios.post<TtsResponse>('/api/tts', request);
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