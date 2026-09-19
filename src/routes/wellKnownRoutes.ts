import { Router } from "express";
import { openidConfiguration } from "../controllers/oauthController";

/**
 * 根路径 OIDC 发现文档。
 *
 * issuer 是站点根（如 https://tts.chloemlla.com），因此依赖方按
 * `${issuer}/.well-known/openid-configuration` 抓取时命中的是这里，而不是
 * `/api/oauth/.well-known/...`；两处必须返回同一份文档，故共用同一个 handler。
 */
export const wellKnownRoutes = Router();
wellKnownRoutes.get("/", openidConfiguration);
