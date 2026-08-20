import { Router, type Request, type Response } from "express";
import { apiDocsAuthGate } from "../middleware/apiDocsAuth";
import { openapiLimiter } from "../middleware/routeLimiters";
import { readOpenapiJson } from "../services/openapiDocumentService";

async function sendApiDocsJson(_req: Request, res: Response): Promise<void> {
  try {
    res.setHeader("Content-Type", "application/json");
    res.send(await readOpenapiJson());
  } catch (_error) {
    res.status(500).json({ error: "无法读取API文档" });
  }
}

const router = Router();
router.get("/openapi.json", openapiLimiter, apiDocsAuthGate, sendApiDocsJson);
router.get("/api-docs.json", openapiLimiter, apiDocsAuthGate, sendApiDocsJson);

export default router;
