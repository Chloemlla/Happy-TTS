import express from "express";
import { authenticateAdmin } from "../middleware/auth";
import { authenticateToken } from "../middleware/authenticateToken";
import { adminLimiter } from "../middleware/routeLimiters";
import { MarkdownArticleService, createArticleSlug } from "../services/markdownArticleService";

const router = express.Router();
const adminGuards = [adminLimiter, authenticateToken, authenticateAdmin] as const;

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "请求处理失败";
}

function getParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

router.get("/", async (_req, res) => {
  try {
    const articles = await MarkdownArticleService.listPublished();
    res.json({ success: true, articles });
  } catch (error) {
    res.status(500).json({ success: false, message: getErrorMessage(error) });
  }
});

router.get("/admin/all", ...adminGuards, async (_req, res) => {
  try {
    const articles = await MarkdownArticleService.listAdmin();
    res.json({ success: true, articles });
  } catch (error) {
    res.status(500).json({ success: false, message: getErrorMessage(error) });
  }
});

router.get("/admin/:id", ...adminGuards, async (req, res) => {
  try {
    const article = await MarkdownArticleService.getAdminById(getParam(req.params.id));
    if (!article) {
      return res.status(404).json({ success: false, message: "文章不存在" });
    }
    res.json({ success: true, article });
  } catch (error) {
    res.status(500).json({ success: false, message: getErrorMessage(error) });
  }
});

router.post("/", ...adminGuards, async (req, res) => {
  try {
    const user = (req as any).user;
    const article = await MarkdownArticleService.create({
      title: req.body?.title,
      slug: req.body?.slug || createArticleSlug(req.body?.title || ""),
      excerpt: req.body?.excerpt,
      content: req.body?.content,
      status: req.body?.status,
      authorId: String(user?.id || user?._id || "admin"),
      authorName: String(user?.username || user?.email || "admin"),
    });
    res.status(201).json({ success: true, article });
  } catch (error) {
    res.status(400).json({ success: false, message: getErrorMessage(error) });
  }
});

router.put("/admin/:id", ...adminGuards, async (req, res) => {
  try {
    const article = await MarkdownArticleService.update(getParam(req.params.id), {
      title: req.body?.title,
      slug: req.body?.slug,
      excerpt: req.body?.excerpt,
      content: req.body?.content,
      status: req.body?.status,
      authorId: "admin",
      authorName: "admin",
    });
    if (!article) {
      return res.status(404).json({ success: false, message: "文章不存在" });
    }
    res.json({ success: true, article });
  } catch (error) {
    res.status(400).json({ success: false, message: getErrorMessage(error) });
  }
});

router.patch("/admin/:id/status", ...adminGuards, async (req, res) => {
  try {
    const status = req.body?.status === "published" ? "published" : "draft";
    const article = await MarkdownArticleService.setStatus(getParam(req.params.id), status);
    if (!article) {
      return res.status(404).json({ success: false, message: "文章不存在" });
    }
    res.json({ success: true, article });
  } catch (error) {
    res.status(400).json({ success: false, message: getErrorMessage(error) });
  }
});

router.delete("/admin/:id", ...adminGuards, async (req, res) => {
  try {
    const deleted = await MarkdownArticleService.delete(getParam(req.params.id));
    if (!deleted) {
      return res.status(404).json({ success: false, message: "文章不存在" });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: getErrorMessage(error) });
  }
});

router.get("/:slug", async (req, res) => {
  try {
    const article = await MarkdownArticleService.getPublishedBySlug(getParam(req.params.slug));
    if (!article) {
      return res.status(404).json({ success: false, message: "文章不存在或尚未发布" });
    }
    res.json({ success: true, article });
  } catch (error) {
    res.status(400).json({ success: false, message: getErrorMessage(error) });
  }
});

export default router;
