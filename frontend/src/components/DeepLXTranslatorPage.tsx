import React, { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { m } from 'framer-motion';
import {
  FaBolt,
  FaCopy,
  FaExchangeAlt,
  FaHistory,
  FaLanguage,
  FaPaste,
  FaTrash,
  FaVolumeUp,
} from 'react-icons/fa';
import {
  fetchDeepLXConfig,
  translateWithDeepLX,
  type DeepLXConfigResponse,
} from '../api/deeplx';
import { useAuth } from '../hooks/useAuth';
import { useNotification } from './Notification';

interface TranslatorHistoryItem {
  id: string;
  createdAt: string;
  sourceText: string;
  translatedText: string;
  sourceLang: string;
  targetLang: string;
}

interface LanguageOption {
  code: string;
  label: string;
  nativeLabel: string;
  voice?: string;
}

const STORAGE_KEY = 'synapse_deeplx_history';
const AUTO_LANGUAGE_CODE = 'auto';
const DEFAULT_TARGET = 'EN';

const LANGUAGES: LanguageOption[] = [
  { code: AUTO_LANGUAGE_CODE, label: 'Detect', nativeLabel: '自动识别' },
  { code: 'ZH', label: 'Chinese', nativeLabel: '中文', voice: 'zh-CN' },
  { code: 'EN', label: 'English', nativeLabel: 'English', voice: 'en-US' },
  { code: 'JA', label: 'Japanese', nativeLabel: '日本語', voice: 'ja-JP' },
  { code: 'KO', label: 'Korean', nativeLabel: '한국어', voice: 'ko-KR' },
  { code: 'FR', label: 'French', nativeLabel: 'Français', voice: 'fr-FR' },
  { code: 'DE', label: 'German', nativeLabel: 'Deutsch', voice: 'de-DE' },
  { code: 'ES', label: 'Spanish', nativeLabel: 'Español', voice: 'es-ES' },
  { code: 'IT', label: 'Italian', nativeLabel: 'Italiano', voice: 'it-IT' },
  { code: 'PT', label: 'Portuguese', nativeLabel: 'Português', voice: 'pt-PT' },
  { code: 'RU', label: 'Russian', nativeLabel: 'Русский', voice: 'ru-RU' },
  { code: 'AR', label: 'Arabic', nativeLabel: 'العربية', voice: 'ar-SA' },
];

const QUICK_PHRASES = [
  'Translate this release note into concise English.',
  '把这段客服回复润色成更自然的中文。',
  'Summarize the following paragraph in Japanese.',
  '请将技术文档翻译成适合产品页面展示的语言。',
];

const SOURCE_HOT_LANGUAGES = LANGUAGES.slice(0, 6);
const TARGET_HOT_LANGUAGES = LANGUAGES.filter((item) => item.code !== AUTO_LANGUAGE_CODE).slice(0, 6);

function getLanguageByCode(code: string): LanguageOption | undefined {
  return LANGUAGES.find((item) => item.code === code);
}

function loadHistory(): TranslatorHistoryItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistory(items: TranslatorHistoryItem[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, 8)));
}

async function copyText(value: string): Promise<void> {
  await navigator.clipboard.writeText(value);
}

async function pasteText(): Promise<string> {
  return navigator.clipboard.readText();
}

function speakText(text: string, voice?: string): void {
  if (!('speechSynthesis' in window) || !text.trim()) {
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  if (voice) {
    utterance.lang = voice;
  }
  window.speechSynthesis.speak(utterance);
}

export const DeepLXTranslatorPage: React.FC = () => {
  const { setNotification } = useNotification();
  const { user } = useAuth();
  const [config, setConfig] = useState<DeepLXConfigResponse | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [sourceText, setSourceText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [alternatives, setAlternatives] = useState<string[]>([]);
  const [sourceLang, setSourceLang] = useState(AUTO_LANGUAGE_CODE);
  const [detectedSourceLang, setDetectedSourceLang] = useState(AUTO_LANGUAGE_CODE);
  const [targetLang, setTargetLang] = useState(DEFAULT_TARGET);
  const [autoTranslate, setAutoTranslate] = useState(true);
  const [translating, setTranslating] = useState(false);
  const [history, setHistory] = useState<TranslatorHistoryItem[]>([]);
  const activeControllerRef = useRef<AbortController | null>(null);

  const displaySourceLang = sourceLang === AUTO_LANGUAGE_CODE ? detectedSourceLang : sourceLang;
  const sourceLanguageLabel = getLanguageByCode(displaySourceLang)?.nativeLabel || '自动识别';
  const targetLanguageLabel = getLanguageByCode(targetLang)?.nativeLabel || targetLang;
  const translationRestrictedUntil = user?.translationAccessUntil
    ? Date.parse(user.translationAccessUntil)
    : 0;
  const translationRestricted = Number.isFinite(translationRestrictedUntil)
    && translationRestrictedUntil > Date.now();

  useEffect(() => {
    startTransition(() => {
      setHistory(loadHistory());
    });
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadConfig = async () => {
      setConfigLoading(true);
      try {
        const next = await fetchDeepLXConfig();
        if (mounted) {
          setConfig(next);
        }
      } catch (error) {
        if (mounted) {
          setConfig({
            enabled: false,
            requiresApiKey: true,
            baseUrl: 'https://api.deeplx.org',
            endpointPath: 'https://api.deeplx.org/<api-key>/translate',
          });
          setNotification({
            message: error instanceof Error ? error.message : '获取 DeepLX 配置失败',
            type: 'error',
          });
        }
      } finally {
        if (mounted) {
          setConfigLoading(false);
        }
      }
    };

    void loadConfig();
    return () => {
      mounted = false;
    };
  }, [setNotification]);

  const persistHistory = useCallback((item: TranslatorHistoryItem) => {
    startTransition(() => {
      setHistory((prev) => {
        const next = [item, ...prev.filter((entry) => entry.id !== item.id)].slice(0, 8);
        saveHistory(next);
        return next;
      });
    });
  }, []);

  const translateNow = useCallback(async (textOverride?: string) => {
    const text = (textOverride ?? sourceText).trim();
    if (!text) {
      setTranslatedText('');
      setAlternatives([]);
      return;
    }

    if (!config?.enabled) {
      setNotification({
        message: 'DeepLX 当前未配置，请先在 EnvManager 中设置可用的 API。',
        type: 'error',
      });
      return;
    }

    if (translationRestricted) {
      setNotification({
        message: '当前账户的翻译权限处于限制状态',
        type: 'error',
      });
      return;
    }

    activeControllerRef.current?.abort();
    const controller = new AbortController();
    activeControllerRef.current = controller;
    setTranslating(true);

    try {
      const result = await translateWithDeepLX(
        {
          text,
          sourceLang,
          targetLang,
        },
        controller.signal,
      );

      setTranslatedText(result.translatedText);
      setAlternatives(result.alternatives);
      setDetectedSourceLang(result.sourceLang || AUTO_LANGUAGE_CODE);

      persistHistory({
        id: `${result.sourceLang}:${result.targetLang}:${text}`,
        createdAt: new Date().toISOString(),
        sourceText: text,
        translatedText: result.translatedText,
        sourceLang: result.sourceLang,
        targetLang: result.targetLang,
      });
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return;
      }

      setNotification({
        message: error instanceof Error ? error.message : 'DeepLX 翻译失败',
        type: 'error',
      });
    } finally {
      if (activeControllerRef.current === controller) {
        activeControllerRef.current = null;
      }
      setTranslating(false);
    }
  }, [config?.enabled, persistHistory, setNotification, sourceLang, sourceText, targetLang]);

  useEffect(() => {
    if (!autoTranslate || !sourceText.trim()) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void translateNow();
    }, 550);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [autoTranslate, sourceLang, sourceText, targetLang, translateNow]);

  useEffect(() => {
    return () => {
      activeControllerRef.current?.abort();
    };
  }, []);

  const handleSwap = useCallback(() => {
    if (sourceLang === AUTO_LANGUAGE_CODE) {
      if (!translatedText.trim() || !detectedSourceLang || detectedSourceLang === AUTO_LANGUAGE_CODE) {
        setNotification({
          message: '自动识别模式下，请先完成一次翻译后再交换语言。',
          type: 'error',
        });
        return;
      }

      const previousSource = sourceText;
      setSourceLang(targetLang);
      setTargetLang(detectedSourceLang);
      setSourceText(translatedText);
      setTranslatedText(previousSource);
      setAlternatives([]);
      return;
    }

    const previousSource = sourceText;
    setSourceLang(targetLang);
    setTargetLang(sourceLang);
    setSourceText(translatedText || previousSource);
    setTranslatedText(previousSource);
    setAlternatives([]);
  }, [detectedSourceLang, setNotification, sourceLang, sourceText, targetLang, translatedText]);

  const handlePaste = useCallback(async () => {
    try {
      const value = await pasteText();
      setSourceText(value);
    } catch {
      setNotification({ message: '读取剪贴板失败，请检查浏览器权限。', type: 'error' });
    }
  }, [setNotification]);

  const handleCopyResult = useCallback(async () => {
    if (!translatedText.trim()) {
      return;
    }

    try {
      await copyText(translatedText);
      setNotification({ message: '译文已复制到剪贴板', type: 'success' });
    } catch {
      setNotification({ message: '复制失败，请稍后重试', type: 'error' });
    }
  }, [setNotification, translatedText]);

  const shortcuts = useMemo(
    () => [
      { label: '自动翻译', value: autoTranslate ? '已开启' : '手动触发' },
      { label: '文本限制', value: '单次最多 5000 字符' },
      { label: '回车动作', value: 'Ctrl/Command + Enter 立即翻译' },
    ],
    [autoTranslate],
  );

  const statusCards = useMemo(
    () => [
      {
        label: 'Status',
        value: configLoading ? '读取中…' : config?.enabled ? '服务可用' : '等待配置',
      },
      {
        label: 'Mode',
        value: autoTranslate ? '自动翻译' : '手动翻译',
      },
      {
        label: 'Direction',
        value: `${sourceLanguageLabel} → ${targetLanguageLabel}`,
      },
    ],
    [autoTranslate, config?.enabled, configLoading, sourceLanguageLabel, targetLanguageLabel],
  );

  if (user?.isTranslationEnabled === false) {
    return (
      <section className="mx-auto max-w-3xl px-4 py-10 sm:py-12">
        <m.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="relative overflow-hidden rounded-[34px] border border-white/70 bg-white/88 p-6 text-center shadow-[0_28px_110px_rgba(15,23,42,0.1)] backdrop-blur-xl sm:p-10"
        >
          <div className="pointer-events-none absolute -right-16 top-0 h-48 w-48 rounded-full bg-[radial-gradient(circle,_rgba(244,63,94,0.18),_transparent_68%)]" />
          <div className="pointer-events-none absolute -left-10 bottom-0 h-40 w-40 rounded-full bg-[radial-gradient(circle,_rgba(14,165,233,0.12),_transparent_70%)]" />
          <div className="relative">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
              <FaLanguage className="text-[10px]" /> TRANSLATION ACCESS
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl">
              当前账户已被停用翻译页面访问
            </h1>
            <p className="mt-4 text-sm leading-7 text-slate-600 sm:text-base">
              管理员已撤销此账户的翻译页面权限。你仍可访问其他功能，但不能进入本翻译工作台。
            </p>
          </div>
        </m.div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-6xl px-4 py-10 sm:py-12">
      <m.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative overflow-hidden rounded-[34px] border border-white/70 bg-white/88 p-6 shadow-[0_28px_110px_rgba(15,23,42,0.1)] backdrop-blur-xl sm:p-10"
      >
        <div className="pointer-events-none absolute -right-16 top-0 h-48 w-48 rounded-full bg-[radial-gradient(circle,_rgba(59,130,246,0.22),_transparent_68%)]" />
        <div className="pointer-events-none absolute -left-10 bottom-0 h-40 w-40 rounded-full bg-[radial-gradient(circle,_rgba(14,165,233,0.16),_transparent_70%)]" />

        <div className="relative">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                <FaLanguage className="text-[10px]" /> TRANSLATE
              </div>
              <h1 className="mt-5 text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl">
                文本翻译
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
                以 DeepLX 作为后端引擎，保留高频翻译场景最需要的操作流：
                自动识别、语言切换、自动翻译、候选译文、本地历史与语音朗读。
              </p>
            </div>

            <div className="grid w-full gap-2 sm:grid-cols-3 lg:w-auto">
              {statusCards.map((item) => (
                <div
                  key={item.label}
                  className="min-w-0 rounded-[22px] border border-slate-200 bg-white/80 px-4 py-3 shadow-[0_10px_40px_rgba(15,23,42,0.04)]"
                >
                  <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">{item.label}</div>
                  <div className="mt-2 break-words text-sm font-semibold text-slate-900">{item.value}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-8 grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="relative min-w-0 rounded-[26px] border border-white/70 bg-white/82 p-4 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur-xl sm:p-5">
              <div className="mb-3 lg:hidden">
                <div className="grid grid-cols-[minmax(0,1fr)_52px_minmax(0,1fr)] items-center gap-2 rounded-[22px] border border-slate-200 bg-white/80 p-2.5">
                  <div className="min-w-0 rounded-[18px] bg-slate-50 px-3 py-2.5">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">From</div>
                    <div className="mt-1 truncate text-sm font-semibold text-slate-900">{sourceLanguageLabel}</div>
                  </div>
                  <button
                    type="button"
                    onClick={handleSwap}
                    className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white transition hover:bg-slate-800 active:scale-[0.98]"
                  >
                    <FaExchangeAlt />
                  </button>
                  <div className="min-w-0 rounded-[18px] bg-slate-50 px-3 py-2.5 text-right">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">To</div>
                    <div className="mt-1 truncate text-sm font-semibold text-slate-900">{targetLanguageLabel}</div>
                  </div>
                </div>
              </div>

              <div className="grid min-w-0 gap-3 lg:grid-cols-2">
                <section className="min-w-0 rounded-[22px] border border-slate-200 bg-white/80 p-4 sm:p-5">
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
                      {SOURCE_HOT_LANGUAGES.map((language) => (
                        <button
                          key={`source-${language.code}`}
                          type="button"
                          onClick={() => setSourceLang(language.code)}
                          className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition sm:text-xs ${
                            sourceLang === language.code
                              ? 'bg-slate-900 text-white'
                              : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
                          }`}
                        >
                          {language.nativeLabel}
                        </button>
                      ))}
                    </div>
                    <select
                      value={sourceLang}
                      onChange={(event) => setSourceLang(event.target.value)}
                      className="w-full rounded-2xl border border-slate-200 bg-white/80 px-3 py-2.5 text-xs font-medium text-slate-700 transition focus:border-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-300 sm:w-auto"
                    >
                      {LANGUAGES.map((language) => (
                        <option key={language.code} value={language.code}>
                          {language.nativeLabel}
                        </option>
                      ))}
                    </select>
                  </div>

                  <label className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">原文</label>
                  <textarea
                    value={sourceText}
                    onChange={(event) => setSourceText(event.target.value)}
                    onKeyDown={(event) => {
                      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                        event.preventDefault();
                        void translateNow();
                      }
                    }}
                    placeholder="输入想翻译的内容，或者直接把整段文案粘贴进来。"
                    className="mt-2 min-h-[220px] w-full resize-none rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-[15px] leading-7 text-slate-900 placeholder:text-slate-400 transition focus:border-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-300 sm:min-h-[280px] sm:text-base sm:leading-8"
                  />

                  <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                      <button
                        type="button"
                        onClick={handlePaste}
                        className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2"
                      >
                        <FaPaste className="text-slate-500" />
                        粘贴
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSourceText('');
                          setTranslatedText('');
                          setAlternatives([]);
                        }}
                        className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2"
                      >
                        <FaTrash className="text-slate-500" />
                        清空
                      </button>
                    </div>

                    <div className="text-right text-[11px] font-medium text-slate-500 sm:text-left sm:text-xs">
                      {sourceText.length} / 5000
                    </div>
                  </div>
                </section>

                <section className="min-w-0 rounded-[22px] border border-slate-200 bg-white/80 p-4 sm:p-5">
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
                      {TARGET_HOT_LANGUAGES.map((language) => (
                        <button
                          key={`target-${language.code}`}
                          type="button"
                          onClick={() => setTargetLang(language.code)}
                          className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition sm:text-xs ${
                            targetLang === language.code
                              ? 'bg-slate-900 text-white'
                              : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
                          }`}
                        >
                          {language.nativeLabel}
                        </button>
                      ))}
                    </div>
                    <select
                      value={targetLang}
                      onChange={(event) => setTargetLang(event.target.value)}
                      className="w-full rounded-2xl border border-slate-200 bg-white/80 px-3 py-2.5 text-xs font-medium text-slate-700 transition focus:border-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-300 sm:w-auto"
                    >
                      {LANGUAGES.filter((item) => item.code !== AUTO_LANGUAGE_CODE).map((language) => (
                        <option key={language.code} value={language.code}>
                          {language.nativeLabel}
                        </option>
                      ))}
                    </select>
                  </div>

                  <label className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">译文</label>
                  <div className="mt-2 min-h-[220px] rounded-2xl border border-slate-200 bg-white/80 p-4 sm:min-h-[280px]">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[11px] font-medium text-slate-500 sm:text-xs">
                      <span>检测语言：{sourceLanguageLabel}</span>
                      <span>输出语言：{targetLanguageLabel}</span>
                    </div>

                    {translating ? (
                      <div className="space-y-3 pt-6">
                        <div className="h-4 w-3/4 animate-pulse rounded-full bg-slate-200" />
                        <div className="h-4 w-5/6 animate-pulse rounded-full bg-slate-200" />
                        <div className="h-4 w-2/3 animate-pulse rounded-full bg-slate-200" />
                      </div>
                    ) : translatedText ? (
                      <div className="space-y-4">
                        <p className="whitespace-pre-wrap break-words text-[15px] leading-7 text-slate-900 sm:text-base sm:leading-8">
                          {translatedText}
                        </p>
                        {alternatives.length > 0 ? (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500">
                              候选译文
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {alternatives.slice(0, 6).map((item) => (
                                <button
                                  key={item}
                                  type="button"
                                  onClick={() => setTranslatedText(item)}
                                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
                                >
                                  {item}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="flex h-full min-h-[180px] items-center justify-center text-center text-[13px] text-slate-500 sm:min-h-[220px] sm:text-sm">
                        译文会出现在这里。开启自动翻译后，输入几秒内会直接刷新结果。
                      </div>
                    )}
                  </div>

                  <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                      <button
                        type="button"
                        onClick={handleCopyResult}
                        disabled={!translatedText.trim()}
                        className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2"
                      >
                        <FaCopy className="text-slate-500" />
                        复制
                      </button>
                      <button
                        type="button"
                        onClick={() => speakText(translatedText, getLanguageByCode(targetLang)?.voice)}
                        disabled={!translatedText.trim()}
                        className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2"
                      >
                        <FaVolumeUp className="text-slate-500" />
                        朗读
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => void translateNow()}
                      disabled={translating || !sourceText.trim()}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 sm:w-auto"
                    >
                      <FaBolt />
                      立即翻译
                    </button>
                  </div>
                </section>
              </div>

              <button
                type="button"
                onClick={handleSwap}
                className="absolute left-1/2 top-1/2 z-10 hidden h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-[0_10px_30px_rgba(15,23,42,0.08)] transition hover:rotate-180 hover:text-slate-900 lg:flex"
              >
                <FaExchangeAlt />
              </button>
            </div>

            <div className="min-w-0 space-y-5">
              <m.section
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.08 }}
                className="relative overflow-hidden rounded-[26px] border border-white/70 bg-white/82 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur-xl"
              >
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500">
                      <FaBolt className="text-slate-500" /> Engine
                    </div>
                    <div className="mt-2 text-lg font-semibold text-slate-900">DeepLX Runtime</div>
                  </div>
                  <label className="inline-flex self-start items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-2 text-xs font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={autoTranslate}
                      onChange={(event) => setAutoTranslate(event.target.checked)}
                    />
                    自动翻译
                  </label>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 text-sm leading-7 text-slate-700">
                  <div className="break-all">
                    <span className="font-semibold text-slate-900">Base URL：</span>
                    {config?.baseUrl || '读取中…'}
                  </div>
                  <div className="mt-2 break-all">
                    <span className="font-semibold text-slate-900">Endpoint：</span>
                    {config?.endpointPath || '读取中…'}
                  </div>
                  {translationRestricted ? (
                    <div className="mt-4 rounded-[22px] border border-rose-200/70 bg-rose-50/80 px-5 py-4 text-sm leading-7 text-rose-700">
                      翻译权限限制截止：
                      {new Date(translationRestrictedUntil).toLocaleString()}
                    </div>
                  ) : null}
                  {!configLoading && !config?.enabled ? (
                    <div className="mt-4 rounded-[22px] border border-amber-200/70 bg-amber-50/80 px-5 py-4 text-sm leading-7 text-amber-700">
                      当前 DeepLX 尚未可用。
                      {config?.requiresApiKey
                        ? ' 你需要先在 EnvManager 中配置 API Key。'
                        : ' 请确认后端地址可访问。'}
                    </div>
                  ) : null}
                </div>

                <div className="mt-5 space-y-2">
                  {shortcuts.map((item) => (
                    <div
                      key={item.label}
                      className="flex flex-col gap-1 rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                    >
                      <span className="text-slate-500">{item.label}</span>
                      <span className="font-semibold text-slate-900">{item.value}</span>
                    </div>
                  ))}
                </div>
              </m.section>

              <m.section
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.14 }}
                className="relative overflow-hidden rounded-[26px] border border-white/70 bg-white/82 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur-xl"
              >
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                    <FaHistory />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500">
                      History
                    </div>
                    <div className="mt-1 text-base font-semibold text-slate-900">最近翻译</div>
                    <div className="text-xs text-slate-500">保存在当前浏览器，本地最多 8 条</div>
                  </div>
                </div>

                <div className="space-y-3">
                  {history.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 px-4 py-6 text-sm text-slate-500">
                      还没有历史记录。先翻译一段文本，这里会自动生成最近访问列表。
                    </div>
                  ) : (
                    history.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setSourceText(item.sourceText);
                          setTranslatedText(item.translatedText);
                          setSourceLang(item.sourceLang || AUTO_LANGUAGE_CODE);
                          setTargetLang(item.targetLang || DEFAULT_TARGET);
                          setDetectedSourceLang(item.sourceLang || AUTO_LANGUAGE_CODE);
                        }}
                        className="w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-left transition hover:border-slate-300 hover:bg-white"
                      >
                        <div className="line-clamp-2 break-words text-sm font-medium text-slate-900">
                          {item.sourceText}
                        </div>
                        <div className="mt-2 line-clamp-2 break-words text-sm text-slate-600">
                          {item.translatedText}
                        </div>
                        <div className="mt-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                          {item.sourceLang} → {item.targetLang}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </m.section>

              <m.section
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.2 }}
                className="relative overflow-hidden rounded-[26px] border border-white/70 bg-white/82 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur-xl"
              >
                <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500">
                  <FaBolt className="text-slate-500" /> 快速填充
                </div>
                <div className="space-y-2">
                  {QUICK_PHRASES.map((phrase) => (
                    <button
                      key={phrase}
                      type="button"
                      onClick={() => setSourceText(phrase)}
                      className="w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-left text-sm text-slate-700 transition hover:border-slate-300 hover:bg-white hover:text-slate-900"
                    >
                      {phrase}
                    </button>
                  ))}
                </div>
              </m.section>
            </div>
          </div>
        </div>
      </m.div>
    </section>
  );
};

export default DeepLXTranslatorPage;
