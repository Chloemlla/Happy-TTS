import { useState } from 'react';
import axios, { AxiosError } from 'axios';
import { TtsRequest, TtsResponse } from '../types/tts';
import { verifyContent } from '../utils/sign';

// 获取API基础URL
const getApiBaseUrl = () => {
    if (import.meta.env.DEV) return '';
    if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
    return 'https://api.hapxs.com';
};

// 创建axios实例
const api = axios.create({
    baseURL: getApiBaseUrl(),
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

      // 获取认证 token
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('请先登录');
      }

      console.log('发送TTS请求:', request);
      const response = await api.post<TtsResponse>('/api/tts/generate', {
        ...request,
      }, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      console.log('收到TTS响应:', response.data);
      
      if (response.data) {
        if (!response.data.success) {
          console.error('生成失败:', response.data);
          throw new Error('语音生成失败');
        }

        // 兼容 fileName 字段
        const audioUrl = response.data.audioUrl || response.data.fileName;
        if (!audioUrl) {
          console.error('响应中缺少audioUrl和fileName:', response.data);
          throw new Error('服务器返回数据缺少音频URL');
        }

        if (!response.data.signature) {
          console.error('响应中缺少signature:', response.data);
          throw new Error('服务器返回数据缺少签名');
        }

        // 校验签名
        try {
          const isValid = verifyContent(audioUrl, response.data.signature);
          console.log('签名验证结果:', isValid);
          if (!isValid) {
            throw new Error('内容签名校验失败，数据可能被篡改');
          }
        } catch (error: unknown) {
          const signError = error instanceof Error ? error : new Error('未知签名验证错误');
          console.error('签名验证错误:', signError);
          throw new Error(`签名校验失败: ${signError.message}`);
        }

        // 确保音频URL是完整的
        const finalAudioUrl = audioUrl.startsWith('http') 
          ? audioUrl 
          : `${api.defaults.baseURL}/static/audio/${audioUrl}`;
        
        console.log('设置音频URL:', finalAudioUrl);
        setAudioUrl(finalAudioUrl);
        return {
          ...response.data,
          audioUrl: finalAudioUrl
        };
      } else {
        console.error('服务器返回空数据');
        throw new Error('服务器返回数据格式错误');
      }
    } catch (error) {
      console.error('TTS请求错误:', error);
      
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        if (axiosError.response) {
          // 服务器返回错误响应
          const errorData = axiosError.response.data as { 
            message?: string; 
            error?: string;
            details?: {
              provided?: string;
              expected?: string;
            }
          };

          // 处理生成码错误
          if (axiosError.response.status === 403 && errorData.details) {
            const errorMessage = `生成码无效 - 提供的生成码: ${errorData.details.provided || '无'}, 期望的生成码: ${errorData.details.expected || '无'}`;
            console.error('生成码验证失败:', errorData.details);
            setError(errorMessage);
            throw new Error(errorMessage);
          }

          const errorMessage = errorData?.error || errorData?.message || '服务器错误';
          console.error('服务器错误响应:', errorData);
          setError(errorMessage);
          throw new Error(errorMessage);
        } else if (axiosError.request) {
          // 请求发送但没有收到响应
          const errorMessage = `网络连接错误，请检查网络连接\n详细信息: ${JSON.stringify(axiosError.toJSON ? axiosError.toJSON() : axiosError)}`;
          console.error('网络错误:', axiosError.request);
          setError(errorMessage);
          throw new Error(errorMessage);
        } else {
          // 请求配置出错
          const errorMessage = '请求配置错误';
          console.error('请求配置错误:', axiosError.message);
          setError(errorMessage);
          throw new Error(errorMessage);
        }
      } else {
        // 其他错误
        const errorMessage = error instanceof Error ? error.message : '生成语音时发生未知错误';
        console.error('未知错误:', error);
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