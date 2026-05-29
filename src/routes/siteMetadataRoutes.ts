import { Router, type RequestHandler } from "express";
import { getNexaiAssetLinksStatements } from "../utils/nexaiWebAuthn";

const SITE_ICON_URL = "https://img.cdn1.vip/i/6a151e1365e9c_1779768851.webp";

export const sendFaviconIfExists: RequestHandler = (_req, res) => {
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.redirect(302, SITE_ICON_URL);
};

export const faviconRoutes = Router();
faviconRoutes.get("/", sendFaviconIfExists);

export const assetLinksRoutes = Router();
assetLinksRoutes.get("/", (_req, res) => {
  res.setHeader("Cache-Control", "public, max-age=300");
  res.json(getNexaiAssetLinksStatements());
});

