import type { Request, Response } from "express";
import { config } from "../config/config";
import { buildTtsProviderPublicConfig } from "../config/ttsProviderConfig";
import {
  applyCatalogPageNumber,
  validateFishAudioProxyUrl,
  type FishAudioCatalogRequest,
} from "../config/fishAudioCatalog";
import { RuntimeConfigService } from "../services/runtimeConfigService";
import logger from "../utils/logger";

const FISH_CATALOG_TIMEOUT_MS = 20_000;

export interface FishAudioCatalogItem {
  id: string;
  title: string;
  description?: string;
  coverImage?: string;
  languages: string[];
  tags: string[];
  sampleAudio?: string;
  author?: string;
}

function normalizeCatalogItem(value: unknown): FishAudioCatalogItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const id = typeof raw._id === "string" ? raw._id.trim() : "";
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id) || !title) return null;
  const author = raw.author && typeof raw.author === "object" && !Array.isArray(raw.author)
    ? (raw.author as Record<string, unknown>)
    : {};
  const samples = Array.isArray(raw.samples) ? raw.samples : [];
  const sample = samples.find((item) => item && typeof item === "object" && typeof (item as Record<string, unknown>).audio === "string") as Record<string, unknown> | undefined;
  const stringArray = (input: unknown): string[] => Array.isArray(input)
    ? input.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, 20)
    : [];
  return {
    id,
    title: title.slice(0, 256),
    ...(typeof raw.description === "string" && raw.description.trim() ? { description: raw.description.trim().slice(0, 1000) } : {}),
    ...(typeof raw.cover_image === "string" && /^https?:\/\//i.test(raw.cover_image) ? { coverImage: raw.cover_image } : {}),
    languages: stringArray(raw.languages),
    tags: stringArray(raw.tags),
    ...(sample && typeof sample.audio === "string" && /^https?:\/\//i.test(sample.audio) ? { sampleAudio: sample.audio } : {}),
    ...(typeof author.nickname === "string" && author.nickname.trim() ? { author: author.nickname.trim().slice(0, 128) } : {}),
  };
}

function normalizeCatalogResponse(payload: unknown): { items: FishAudioCatalogItem[]; hasMore: boolean } {
  let records: unknown[] = [];
  if (Array.isArray(payload)) {
    records = payload;
  } else if (payload && typeof payload === "object") {
    const items = (payload as Record<string, unknown>).items;
    if (Array.isArray(items)) records = items;
  }
  const unique = new Map<string, FishAudioCatalogItem>();
  for (const record of records) {
    const item = normalizeCatalogItem(record);
    if (item) unique.set(item.id, item);
  }
  return {
    items: Array.from(unique.values()),
    hasMore: Boolean(payload && typeof payload === "object" && (payload as Record<string, unknown>).has_more === true),
  };
}

async function fetchFishCatalog(request: FishAudioCatalogRequest, page?: number): Promise<{ items: FishAudioCatalogItem[]; hasMore: boolean }> {
  const url = page !== undefined ? applyCatalogPageNumber(request.url, page) : request.url;
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json", ...request.headers },
    signal: AbortSignal.timeout(FISH_CATALOG_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Fish Audio 音色请求失败（${response.status}）`);
  return normalizeCatalogResponse(await response.json());
}

export const ttsProviderController = {
  async getPublicConfig(_req: Request, res: Response) {
    try {
      const runtimeConfig = await RuntimeConfigService.getRawTtsProviderConfig();
      return res.json({
        success: true,
        config: buildTtsProviderPublicConfig(runtimeConfig, {
          model: config.openaiModel,
          voice: config.openaiVoice,
        }),
      });
    } catch (error) {
      logger.warn("[TTS] Failed to read public provider config", {
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(503).json({ success: false, error: "TTS 提供方配置暂不可用" });
    }
  },

  async getAdminConfig(_req: Request, res: Response) {
    try {
      const setting = await RuntimeConfigService.getTtsProviderSetting();
      return res.json({ success: true, config: setting.config });
    } catch (error) {
      logger.warn("[TTS] Failed to read administrator provider config", {
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(503).json({ success: false, error: "读取 TTS 提供方配置失败" });
    }
  },

  async updateAdminConfig(req: Request, res: Response) {
    try {
      await RuntimeConfigService.setTtsProviderSetting(req.body);
      const setting = await RuntimeConfigService.getTtsProviderSetting();
      return res.json({ success: true, config: setting.config });
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : "保存 TTS 提供方配置失败",
      });
    }
  },

  async getFishCatalog(req: Request, res: Response) {
    try {
      const sourceName = typeof req.query.source === "string" ? req.query.source : "model";
      if (sourceName !== "model" && sourceName !== "default-voices") {
        return res.status(400).json({ success: false, error: "Fish Audio 音色来源无效" });
      }
      const runtimeConfig = await RuntimeConfigService.getRawTtsProviderConfig();
      if (runtimeConfig.provider !== "fish") return res.json({ success: true, items: [], hasMore: false, page: 1 });
      const source = sourceName === "default-voices"
        ? runtimeConfig.fish.catalog?.defaultVoicesRequest
        : runtimeConfig.fish.catalog?.modelRequest;
      if (!source) return res.json({ success: true, items: [], hasMore: false, page: 1 });

      const rawPage = typeof req.query.page === "string" ? parseInt(req.query.page, 10) : 1;
      const page = Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1;

      const result = await fetchFishCatalog(source, page);
      return res.json({ success: true, ...result, page });
    } catch (error) {
      logger.warn("[TTS] Fish catalog request failed", {
        error: error instanceof Error ? error.message.replace(/Bearer\s+\S+/gi, "Bearer ***") : "unknown",
      });
      return res.status(502).json({ success: false, error: "Fish Audio 音色列表暂时不可用" });
    }
  },

  async getFishAudioSample(req: Request, res: Response) {
    try {
      const audioUrl = typeof req.query.url === "string" ? req.query.url.trim() : "";
      if (!audioUrl) {
        return res.status(400).json({ success: false, error: "缺少音频 URL 参数" });
      }

      const safeUrl = validateFishAudioProxyUrl(audioUrl);
      if (!safeUrl) {
        return res.status(400).json({ success: false, error: "不支持的音频 URL" });
      }

      const runtimeConfig = await RuntimeConfigService.getRawTtsProviderConfig();
      const modelRequest = runtimeConfig.fish.catalog?.modelRequest;
      const defaultVoicesRequest = runtimeConfig.fish.catalog?.defaultVoicesRequest;
      const authorization = modelRequest?.headers?.authorization || defaultVoicesRequest?.headers?.authorization;
      const headers: Record<string, string> = {
        Accept: "audio/*, */*",
        ...(authorization ? { authorization } : {}),
      };

      // codeql[js/request-forgery] — safeUrl validated by validateFishAudioProxyUrl()
      // (TRUSTED_AUDIO_HOSTS + *.fish.audio, https only)
      const response = await fetch(safeUrl, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(FISH_CATALOG_TIMEOUT_MS),
      });

      if (!response.ok) {
        return res.status(502).json({ success: false, error: "获取音频样本失败" });
      }

      const contentType = response.headers.get("content-type") || "audio/wav";
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.setHeader("X-Content-Type-Options", "nosniff");

      if (response.body) {
        const reader = response.body.getReader();
        const pump = async (): Promise<void> => {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) { res.end(); return; }
              res.write(Buffer.from(value));
            }
          } catch (streamError) {
            if (!res.headersSent) res.status(502).end();
          }
        };
        await pump();
      } else {
        res.end();
      }
    } catch (error) {
      logger.warn("[TTS] Fish audio sample proxy failed", {
        error: error instanceof Error ? error.message : "unknown",
      });
      if (!res.headersSent) {
        res.status(502).json({ success: false, error: "获取音频样本失败" });
      }
    }
  },
};
