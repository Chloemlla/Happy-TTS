import { useCallback, useState } from "react";
import axios, { AxiosError, AxiosHeaders } from "axios";
import type {
  TtsHistoryRecord,
  TtsJobStatusResponse,
  TtsRequest,
  TtsResponse,
  TtsSubmitResponse,
} from "../types/tts";
import { verifyContent } from "../utils/sign";
import { getApiBaseUrl } from "../api/api";
import { getFingerprint } from "../utils/fingerprint";
import { canonicalizeBackendApiUrl } from "../utils/apiPath";
import {
  buildIpVerificationHeaders,
  clearIpVerificationToken,
  emitIpVerificationRequired,
  isExemptPath,
} from "../utils/ipVerification";

type TtsErrorPayload = {
  error?: string;
  errorCode?: string;
  message?: string;
  nextAction?: {
    message?: string;
  };
};

const api = axios.create({
  baseURL: getApiBaseUrl(),
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 30000,
});

api.interceptors.request.use(async (config) => {
  if (typeof config.url === "string") {
    config.url = canonicalizeBackendApiUrl(config.url);
  }

  const headers =
    config.headers instanceof AxiosHeaders
      ? config.headers
      : new AxiosHeaders(config.headers);
  config.headers = headers;

  try {
    const verificationHeaders = await buildIpVerificationHeaders();
    Object.entries(verificationHeaders).forEach(([key, value]) => headers.set(key, value));
  } catch {
    // Let the backend return the authoritative verification error.
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (requestError) => {
    const axiosError = requestError as AxiosError<TtsErrorPayload>;
    const payload = axiosError.response?.data;
    if (axiosError.response?.status === 403 && payload?.errorCode === "IP_VERIFICATION_REQUIRED") {
      const requestUrl = axiosError.config?.url || "";
      let pathname = "";
      try {
        const baseUrl = axiosError.config?.baseURL || getApiBaseUrl() || window.location.origin;
        pathname = new URL(requestUrl, baseUrl).pathname;
      } catch {
        pathname = "";
      }

      if (!pathname || !isExemptPath(pathname)) {
        clearIpVerificationToken();
        emitIpVerificationRequired(payload as Record<string, unknown>);
      }
    }
    return Promise.reject(requestError);
  },
);

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

type TtsHistoryPayload = TtsHistoryRecord[] | { records?: TtsHistoryRecord[] };

type LegacyTtsHistoryRecord = TtsHistoryRecord & {
  input?: string;
  generatedText?: string;
};

const normalizeHistory = (payload: TtsHistoryPayload): TtsHistoryRecord[] => {
  const records = Array.isArray(payload) ? payload : payload.records || [];
  return records.map((record) => {
    const legacyRecord = record as LegacyTtsHistoryRecord;

    return {
      ...record,
      text: legacyRecord.text || legacyRecord.generatedText || legacyRecord.input || "",
      audioUrl: record.audioUrl ? resolveAudioUrl(record.audioUrl) : "",
      reviewStatus: record.reviewStatus || "none",
    };
  });
};

export const useTts = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [result, setResult] = useState<TtsResponse | null>(null);
  const [history, setHistory] = useState<TtsHistoryRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const reset = () => {
    setError(null);
    setAudioUrl(null);
    setResult(null);
  };

  const fetchHistory = useCallback(async (limit = 20): Promise<TtsHistoryRecord[]> => {
    try {
      setHistoryLoading(true);
      setHistoryError(null);

      const fingerprint = await getFingerprint();
      const response = await api.get<TtsHistoryPayload>("/api/tts/history", {
        params: {
          limit,
          ...(fingerprint ? { fingerprint } : {}),
        },
      });

      const records = normalizeHistory(response.data);
      setHistory(records);
      return records;
    } catch (requestError) {
      if (axios.isAxiosError(requestError)) {
        const axiosError = requestError as AxiosError<TtsErrorPayload>;
        const message =
          axiosError.response?.data?.error ||
          axiosError.response?.data?.message ||
          axiosError.message ||
          "获取历史记录失败";
        setHistoryError(message);
        throw new Error(message);
      }

      const message = requestError instanceof Error ? requestError.message : "获取历史记录失败";
      setHistoryError(message);
      throw new Error(message);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const generateSpeech = async (request: TtsRequest): Promise<TtsResponse> => {
    try {
      setLoading(true);
      setError(null);
      setAudioUrl(null);
      setResult(null);

      const fingerprint = request.fingerprint || (await getFingerprint());
      const requestPayload = {
        ...request,
        ...(fingerprint ? { fingerprint } : {}),
      };

      const submitResponse = await api.post<TtsSubmitResponse>("/api/tts/jobs", requestPayload);

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
        text: responseData.text || request.text,
        audioUrl: finalAudioUrl,
        taskId: submitData.taskId,
      };

      setAudioUrl(finalAudioUrl);
      setResult(normalizedResult);
      void fetchHistory(20).catch(() => {});
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
    history,
    historyLoading,
    historyError,
    reset,
    generateSpeech,
    fetchHistory,
  };
};
