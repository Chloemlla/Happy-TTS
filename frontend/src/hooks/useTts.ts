import { useState } from "react";
import axios, { AxiosError } from "axios";
import { TtsRequest, TtsResponse } from "../types/tts";
import { verifyContent } from "../utils/sign";
import { getApiBaseUrl } from "../api/api";

const api = axios.create({
  baseURL: getApiBaseUrl(),
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 30000,
});

type TtsErrorPayload = {
  error?: string;
  message?: string;
  nextAction?: {
    message?: string;
  };
};

export const useTts = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [result, setResult] = useState<TtsResponse | null>(null);

  const reset = () => {
    setError(null);
    setAudioUrl(null);
    setResult(null);
  };

  const generateSpeech = async (request: TtsRequest): Promise<TtsResponse> => {
    try {
      setLoading(true);
      setError(null);
      setAudioUrl(null);
      setResult(null);

      const token = localStorage.getItem("token");
      if (!token) {
        throw new Error("请先登录");
      }

      const response = await api.post<TtsResponse>("/api/tts/generate", request, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const responseData = response.data;
      if (!responseData?.success) {
        throw new Error(responseData?.message || "语音生成失败");
      }

      if (!responseData.audioUrl) {
        throw new Error("服务器返回数据缺少音频URL");
      }

      if (!responseData.signature) {
        throw new Error("服务器返回数据缺少签名");
      }

      try {
        const isValid = verifyContent(responseData.audioUrl, responseData.signature);
        if (!isValid) {
          throw new Error("内容签名校验失败，数据可能被篡改");
        }
      } catch (signError) {
        const resolvedError =
          signError instanceof Error ? signError.message : "未知签名验证错误";
        throw new Error(`签名校验失败: ${resolvedError}`);
      }

      const finalAudioUrl = responseData.audioUrl.startsWith("http")
        ? responseData.audioUrl
        : `${api.defaults.baseURL}/static/audio/${responseData.audioUrl}`;

      const normalizedResult: TtsResponse = {
        ...responseData,
        audioUrl: finalAudioUrl,
      };

      setAudioUrl(finalAudioUrl);
      setResult(normalizedResult);
      return normalizedResult;
    } catch (requestError) {
      if (axios.isAxiosError(requestError)) {
        const axiosError = requestError as AxiosError<TtsErrorPayload>;
        const errorMessage =
          axiosError.response?.data?.error ||
          axiosError.response?.data?.message ||
          axiosError.response?.data?.nextAction?.message ||
          (axiosError.request ? "网络连接错误，请检查网络连接后重试" : axiosError.message) ||
          "生成失败，请稍后重试";

        setError(errorMessage);
        throw new Error(errorMessage);
      }

      const errorMessage =
        requestError instanceof Error ? requestError.message : "生成语音时发生未知错误";
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    error,
    audioUrl,
    result,
    reset,
    generateSpeech,
  };
};
