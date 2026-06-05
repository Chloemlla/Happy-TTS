import { useState } from "react";
import axios, { AxiosError } from "axios";
import { TtsJobStatusResponse, TtsRequest, TtsResponse, TtsSubmitResponse } from "../types/tts";
import { verifyContent } from "../utils/sign";
import { getApiBaseUrl } from "../api/api";
import { getFingerprint } from "../utils/fingerprint";

const api = axios.create({
  baseURL: getApiBaseUrl(),
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 30000,
});

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const resolveAudioUrl = (rawAudioUrl: string): string => {
  if (rawAudioUrl.startsWith("http")) {
    return rawAudioUrl;
  }

  const baseUrl = String(api.defaults.baseURL || "").replace(/\/+$/, "");
  if (rawAudioUrl.startsWith("/")) {
    return baseUrl ? `${baseUrl}${rawAudioUrl}` : rawAudioUrl;
  }

  return baseUrl ? `${baseUrl}/static/audio/${rawAudioUrl}` : `/static/audio/${rawAudioUrl}`;
};

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

      const fingerprint = request.fingerprint || (await getFingerprint());
      const requestPayload = {
        ...request,
        ...(fingerprint ? { fingerprint } : {}),
      };

      const submitResponse = await api.post<TtsSubmitResponse>("/api/tts/jobs", requestPayload, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const submitData = submitResponse.data;
      if (!submitData?.success || !submitData.taskId) {
        throw new Error(submitData?.message || "语音任务提交失败");
      }

      if (submitData.status === "queued") {
        const pollInterval = submitData.pollAfterMs ?? 1500;
        const maxAttempts = 120;
        let completed = false;

        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
          await sleep(pollInterval);

          const statusResponse = await api.get<TtsJobStatusResponse>(`/api/tts/jobs/${submitData.taskId}`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            params: fingerprint ? { fingerprint } : undefined,
          });

          const statusData = statusResponse.data;
          if (statusData.status === "completed") {
            completed = true;
            break;
          }

          if (statusData.status === "failed") {
            throw new Error(statusData.error || statusData.message || "语音生成失败");
          }
        }

        if (!completed) {
          throw new Error("任务处理超时，请稍后重试");
        }
      }

      const response = await api.get<TtsResponse>(`/api/tts/jobs/${submitData.taskId}/result`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        params: fingerprint ? { fingerprint } : undefined,
      });

      const responseData = response.data;
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

      const finalAudioUrl = resolveAudioUrl(responseData.audioUrl);

      const normalizedResult: TtsResponse = {
        ...responseData,
        audioUrl: finalAudioUrl,
        taskId: submitData.taskId,
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
