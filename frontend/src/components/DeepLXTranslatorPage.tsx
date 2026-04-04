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
        tone: 'border-sky-100 bg-[linear-gradient(145deg,rgba(240,249,255,0.94),rgba(255,255,255,0.98))]',
      },
      {
        label: 'Mode',
        value: autoTranslate ? '自动翻译' : '手动翻译',
        tone: 'border-violet-100 bg-[linear-gradient(145deg,rgba(245,243,255,0.94),rgba(255,255,255,0.98))]',
      },
      {
        label: 'Direction',
        value: `${sourceLanguageLabel} → ${targetLanguageLabel}`,
        tone: 'border-emerald-100 bg-[linear-gradient(145deg,rgba(236,253,245,0.94),rgba(255,255,255,0.98))]',
      },
    ],
    [autoTranslate, config?.enabled, configLoading, sourceLanguageLabel, targetLanguageLabel],
  );

  const pageFont = '"Avenir Next","PingFang SC","Noto Sans SC","Microsoft YaHei",sans-serif';
  const displayFont = '"Iowan Old Style","Noto Serif SC","Source Han Serif SC",serif';

  if (user?.isTranslationEnabled === false) {
    return (
      <div className="min-h-screen bg-slate-100 px-4 py-10 sm:px-6 sm:py-16" style={{ fontFamily: pageFont }}>
        <div className="mx-auto max-w-3xl rounded-[28px] border border-rose-100 bg-white p-6 text-center shadow-xl sm:rounded-[32px] sm:p-10">
          <div className="text-sm font-semibold uppercase tracking-[0.3em] text-rose-400">Translation Access</div>
          <h1 className="mt-4 text-3xl font-semibold text-slate-900 sm:text-4xl" style={{ fontFamily: displayFont }}>
            当前账户已被停用翻译页面访问
          </h1>
          <p className="mt-4 text-sm leading-7 text-slate-500 sm:text-base sm:leading-8">
            管理员已撤销此账户的翻译页面权限。你仍可访问其他功能，但不能进入本翻译工作台。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top,_rgba(68,92,190,0.16),_transparent_32%),linear-gradient(180deg,#eef2ff_0%,#f9fafb_42%,#eef4ff_100%)] px-3 py-4 sm:px-6 sm:py-8 lg:px-10"
      style={{ fontFamily: pageFont }}
    >
      <div className="mx-auto max-w-7xl min-w-0">
        <m.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="mb-5 rounded-[28px] border border-white/70 bg-white/75 p-4 shadow-[0_24px_90px_rgba(32,48,90,0.12)] backdrop-blur-xl sm:mb-8 sm:rounded-[32px] sm:p-8 sm:shadow-[0_30px_120px_rgba(32,48,90,0.14)]"
        >
          <div className="flex min-w-0 flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl min-w-0">
              <div className="mb-3 inline-flex max-w-full items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-700 sm:px-3 sm:text-xs sm:tracking-[0.18em]">
                <FaLanguage />
                DeepLX Translation Studio
              </div>
              <h1
                className="text-[2rem] font-semibold leading-[1.05] text-slate-900 sm:text-5xl sm:leading-tight"
                style={{ fontFamily: displayFont }}
              >
                一套真正可用的双栏翻译工作台
              </h1>
              <p className="mt-3 max-w-2xl text-[13px] leading-6 text-slate-600 sm:text-base sm:leading-7">
                用 DeepLX 作为后端翻译引擎，保留高频翻译场景最需要的操作流：
                自动识别、语言切换、自动翻译、候选译文、本地历史和语音朗读。
              </p>
            </div>

            <div className="w-full lg:w-auto">
              <div className="grid gap-2 sm:grid-cols-3 sm:gap-3">
                {statusCards.map((item) => (
                  <div
                    key={item.label}
                    className={`min-w-0 rounded-[22px] border px-3 py-2.5 sm:rounded-2xl sm:px-4 sm:py-3 ${item.tone}`}
                  >
                    <div className="text-[10px] uppercase tracking-[0.24em] text-slate-400">{item.label}</div>
                    <div className="mt-2 break-words text-sm font-semibold text-slate-800">{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </m.div>

        <div className="grid gap-4 sm:gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <m.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="relative min-w-0 rounded-[28px] border border-slate-200/80 bg-white/85 p-2.5 shadow-[0_20px_70px_rgba(32,48,90,0.1)] backdrop-blur-xl sm:rounded-[34px] sm:p-4 sm:shadow-[0_24px_90px_rgba(32,48,90,0.1)]"
          >
            <div className="mb-2.5 lg:hidden">
              <div className="grid grid-cols-[minmax(0,1fr)_52px_minmax(0,1fr)] items-center gap-2 rounded-[24px] border border-slate-200/80 bg-[linear-gradient(135deg,rgba(239,246,255,0.96),rgba(255,255,255,0.92))] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
                <div className="min-w-0 rounded-[18px] bg-white/90 px-3 py-2.5">
                  <div className="text-[10px] uppercase tracking-[0.24em] text-slate-400">From</div>
                  <div className="mt-1 truncate text-sm font-semibold text-slate-900">{sourceLanguageLabel}</div>
                </div>
                <button
                  type="button"
                  onClick={handleSwap}
                  className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-slate-900 text-white shadow-lg shadow-slate-900/15 transition active:scale-[0.98]"
                >
                  <FaExchangeAlt />
                </button>
                <div className="min-w-0 rounded-[18px] bg-white/90 px-3 py-2.5 text-right">
                  <div className="text-[10px] uppercase tracking-[0.24em] text-slate-400">To</div>
                  <div className="mt-1 truncate text-sm font-semibold text-slate-900">{targetLanguageLabel}</div>
                </div>
              </div>
            </div>

            <div className="grid min-w-0 gap-2.5 sm:gap-3 lg:grid-cols-2">
              <section className="min-w-0 rounded-[24px] border border-slate-200 bg-[#fbfcff] p-3 sm:rounded-[28px] sm:p-5">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                  <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
                    {SOURCE_HOT_LANGUAGES.map((language) => (
                      <button
                        key={`source-${language.code}`}
                        type="button"
                        onClick={() => setSourceLang(language.code)}
                        className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition sm:text-xs ${
                          sourceLang === language.code
                            ? 'bg-slate-900 text-white shadow-sm'
                            : 'bg-white text-slate-500 hover:bg-slate-100'
                        }`}
                      >
                        {language.nativeLabel}
                      </button>
                    ))}
                  </div>
                  <select
                    value={sourceLang}
                    onChange={(event) => setSourceLang(event.target.value)}
                    className="w-full rounded-[18px] border border-slate-200 bg-white px-3 py-2.5 text-xs font-medium text-slate-600 outline-none sm:w-auto sm:rounded-full sm:py-2"
                  >
                    {LANGUAGES.map((language) => (
                      <option key={language.code} value={language.code}>
                        {language.nativeLabel}
                      </option>
                    ))}
                  </select>
                </div>

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
                  className="min-h-[220px] w-full resize-none bg-transparent text-[15px] leading-7 text-slate-900 outline-none placeholder:text-slate-300 sm:min-h-[280px] sm:text-lg sm:leading-8"
                />

                <div className="mt-4 flex flex-col gap-3 sm:mt-5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                  <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                    <button
                      type="button"
                      onClick={handlePaste}
                      className="inline-flex items-center justify-center gap-2 rounded-[18px] border border-slate-200 bg-white px-3 py-2.5 text-[11px] font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900 sm:rounded-full sm:py-2 sm:text-xs"
                    >
                      <FaPaste />
                      粘贴
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSourceText('');
                        setTranslatedText('');
                        setAlternatives([]);
                      }}
                      className="inline-flex items-center justify-center gap-2 rounded-[18px] border border-slate-200 bg-white px-3 py-2.5 text-[11px] font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900 sm:rounded-full sm:py-2 sm:text-xs"
                    >
                      <FaTrash />
                      清空
                    </button>
                  </div>

                  <div className="text-right text-[11px] font-medium text-slate-400 sm:text-left sm:text-xs">
                    {sourceText.length} / 5000
                  </div>
                </div>
              </section>

              <section className="min-w-0 rounded-[24px] border border-slate-200 bg-white p-3 sm:rounded-[28px] sm:p-5">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                  <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
                    {TARGET_HOT_LANGUAGES.map((language) => (
                      <button
                        key={`target-${language.code}`}
                        type="button"
                        onClick={() => setTargetLang(language.code)}
                        className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition sm:text-xs ${
                          targetLang === language.code
                            ? 'bg-[#2541b2] text-white shadow-sm'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                      >
                        {language.nativeLabel}
                      </button>
                    ))}
                  </div>
                  <select
                    value={targetLang}
                    onChange={(event) => setTargetLang(event.target.value)}
                    className="w-full rounded-[18px] border border-slate-200 bg-white px-3 py-2.5 text-xs font-medium text-slate-600 outline-none sm:w-auto sm:rounded-full sm:py-2"
                  >
                    {LANGUAGES.filter((item) => item.code !== AUTO_LANGUAGE_CODE).map((language) => (
                      <option key={language.code} value={language.code}>
                        {language.nativeLabel}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="min-h-[220px] rounded-[22px] bg-[linear-gradient(180deg,rgba(242,246,255,0.88),rgba(255,255,255,0.96))] p-3.5 sm:min-h-[280px] sm:rounded-[24px] sm:p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[11px] font-medium text-slate-400 sm:text-xs">
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
                      <p className="whitespace-pre-wrap break-words text-[15px] leading-7 text-slate-900 sm:text-lg sm:leading-8">
                        {translatedText}
                      </p>
                      {alternatives.length > 0 ? (
                        <div className="space-y-2">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
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
                    <div className="flex h-full min-h-[180px] items-center justify-center text-center text-[13px] text-slate-400 sm:min-h-[220px] sm:text-sm">
                      译文会出现在这里。开启自动翻译后，输入几秒内会直接刷新结果。
                    </div>
                  )}
                </div>

                <div className="mt-4 flex flex-col gap-3 sm:mt-5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                  <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                    <button
                      type="button"
                      onClick={handleCopyResult}
                      disabled={!translatedText.trim()}
                      className="inline-flex items-center justify-center gap-2 rounded-[18px] border border-slate-200 bg-white px-3 py-2.5 text-[11px] font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50 sm:rounded-full sm:py-2 sm:text-xs"
                    >
                      <FaCopy />
                      复制
                    </button>
                    <button
                      type="button"
                      onClick={() => speakText(translatedText, getLanguageByCode(targetLang)?.voice)}
                      disabled={!translatedText.trim()}
                      className="inline-flex items-center justify-center gap-2 rounded-[18px] border border-slate-200 bg-white px-3 py-2.5 text-[11px] font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50 sm:rounded-full sm:py-2 sm:text-xs"
                    >
                      <FaVolumeUp />
                      朗读
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => void translateNow()}
                    disabled={translating || !sourceText.trim()}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-[18px] bg-[#2541b2] px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-[#2541b2]/20 transition hover:bg-[#1f3794] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:rounded-full sm:py-2"
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
              className="absolute left-1/2 top-1/2 z-10 hidden h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-xl transition hover:rotate-180 hover:text-[#2541b2] lg:flex"
            >
              <FaExchangeAlt />
            </button>
          </m.div>

          <div className="min-w-0 space-y-4 sm:space-y-6">
            <m.section
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.12 }}
              className="rounded-[26px] border border-slate-200/80 bg-white/90 p-4 shadow-[0_20px_70px_rgba(32,48,90,0.08)] backdrop-blur-xl sm:rounded-[30px] sm:p-5"
            >
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    翻译引擎
                  </div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">DeepLX Runtime</div>
                </div>
                <label className="inline-flex self-start items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600">
                  <input
                    type="checkbox"
                    checked={autoTranslate}
                    onChange={(event) => setAutoTranslate(event.target.checked)}
                  />
                  自动翻译
                </label>
              </div>

              <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-3.5 text-[13px] leading-6 text-slate-600 sm:rounded-2xl sm:p-4 sm:text-sm sm:leading-7">
                <div className="break-all">
                  Base URL: {config?.baseUrl || '读取中…'}
                </div>
                <div className="mt-2">
                  <span className="break-all">
                    Endpoint: {config?.endpointPath || '读取中…'}
                  </span>
                </div>
                {translationRestricted ? (
                  <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-3 text-rose-700">
                    翻译权限限制截止：
                    {new Date(translationRestrictedUntil).toLocaleString()}
                  </div>
                ) : null}
                {!configLoading && !config?.enabled ? (
                  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-amber-700">
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
                    className="flex flex-col gap-1 rounded-[20px] border border-slate-100 px-3 py-2.5 text-[13px] sm:flex-row sm:items-center sm:justify-between sm:rounded-2xl sm:py-3 sm:text-sm"
                  >
                    <span className="text-slate-500">{item.label}</span>
                    <span className="font-semibold text-slate-800">{item.value}</span>
                  </div>
                ))}
              </div>
            </m.section>

            <m.section
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.18 }}
              className="rounded-[26px] border border-slate-200/80 bg-white/90 p-4 shadow-[0_20px_70px_rgba(32,48,90,0.08)] backdrop-blur-xl sm:rounded-[30px] sm:p-5"
            >
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-900 text-white sm:h-10 sm:w-10">
                  <FaHistory />
                </div>
                <div>
                  <div className="text-lg font-semibold text-slate-900">最近翻译</div>
                  <div className="text-sm text-slate-500">保存在当前浏览器，本地最多 8 条</div>
                </div>
              </div>

              <div className="space-y-3">
                {history.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-400">
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
                      className="w-full rounded-[20px] border border-slate-200 bg-slate-50 px-3.5 py-3 text-left transition hover:border-slate-300 hover:bg-white sm:rounded-2xl sm:px-4"
                    >
                      <div className="line-clamp-2 break-words text-sm font-medium text-slate-800">
                        {item.sourceText}
                      </div>
                      <div className="mt-2 line-clamp-2 break-words text-sm text-slate-500">
                        {item.translatedText}
                      </div>
                      <div className="mt-3 text-[11px] uppercase tracking-[0.18em] text-slate-400">
                        {item.sourceLang} → {item.targetLang}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </m.section>

            <m.section
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.24 }}
              className="rounded-[26px] border border-slate-200/80 bg-[#111827] p-4 text-white shadow-[0_20px_70px_rgba(17,24,39,0.18)] sm:rounded-[30px] sm:p-5"
            >
              <div className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                快速填充
              </div>
              <div className="space-y-2">
                {QUICK_PHRASES.map((phrase) => (
                  <button
                    key={phrase}
                    type="button"
                    onClick={() => setSourceText(phrase)}
                    className="w-full rounded-[20px] border border-white/10 bg-white/5 px-3.5 py-3 text-left text-[13px] text-slate-200 transition hover:border-white/20 hover:bg-white/10 sm:rounded-2xl sm:px-4 sm:text-sm"
                  >
                    {phrase}
                  </button>
                ))}
              </div>
            </m.section>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeepLXTranslatorPage;
