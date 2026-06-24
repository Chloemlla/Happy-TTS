import MarkdownArticleModel, {
  type IMarkdownArticle,
  type MarkdownArticleStatus,
} from "../models/markdownArticleModel";
import { ensureConnection } from "./mongoService";

export interface MarkdownArticleInput {
  title: string;
  slug?: string;
  excerpt?: string;
  content: string;
  status?: MarkdownArticleStatus;
  authorId: string;
  authorName: string;
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function normalizeText(value: unknown, maxLength: number): string {
  return String(value ?? "").trim().slice(0, maxLength);
}

export function createArticleSlug(title: string): string {
  const base = title
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  if (!base) {
    return `article-${Date.now().toString(36)}`;
  }

  return base.slice(0, 100).replace(/^-+|-+$/g, "") || `article-${Date.now().toString(36)}`;
}

function validateSlug(slug: string): void {
  if (!slug || slug.length > 120) {
    throw new Error("文章链接标识长度无效");
  }

  if (!SLUG_PATTERN.test(slug)) {
    throw new Error("文章链接标识只能包含小写字母、数字和连字符");
  }
}

async function ensureUniqueSlug(slug: string, excludeId?: string): Promise<void> {
  const query: Record<string, unknown> = { slug };
  if (excludeId) {
    query._id = { $ne: excludeId };
  }

  const existing = await MarkdownArticleModel.exists(query);
  if (existing) {
    throw new Error("文章链接标识已存在，请更换 slug");
  }
}

function toArticleResponse(article: IMarkdownArticle) {
  return {
    id: (article as any)._id.toString(),
    title: article.title,
    slug: article.slug,
    excerpt: article.excerpt,
    content: article.content,
    status: article.status,
    authorId: article.authorId,
    authorName: article.authorName,
    publishedAt: article.publishedAt,
    createdAt: article.createdAt,
    updatedAt: article.updatedAt,
  };
}

export class MarkdownArticleService {
  static async listPublished() {
    return ensureConnection(async () => {
      const articles = await MarkdownArticleModel.find({ status: "published" })
        .sort({ publishedAt: -1, updatedAt: -1 })
        .select("title slug excerpt status authorName publishedAt createdAt updatedAt")
        .lean()
        .exec();

      return articles.map((article: any) => ({
        id: article._id.toString(),
        title: article.title,
        slug: article.slug,
        excerpt: article.excerpt || "",
        status: article.status,
        authorName: article.authorName,
        publishedAt: article.publishedAt,
        createdAt: article.createdAt,
        updatedAt: article.updatedAt,
      }));
    });
  }

  static async listAdmin() {
    return ensureConnection(async () => {
      const articles = await MarkdownArticleModel.find({})
        .sort({ updatedAt: -1 })
        .select("title slug excerpt status authorName publishedAt createdAt updatedAt")
        .lean()
        .exec();

      return articles.map((article: any) => ({
        id: article._id.toString(),
        title: article.title,
        slug: article.slug,
        excerpt: article.excerpt || "",
        status: article.status,
        authorName: article.authorName,
        publishedAt: article.publishedAt,
        createdAt: article.createdAt,
        updatedAt: article.updatedAt,
      }));
    });
  }

  static async getPublishedBySlug(slug: string) {
    return ensureConnection(async () => {
      validateSlug(slug);
      const article = await MarkdownArticleModel.findOne({ slug, status: "published" }).exec();
      return article ? toArticleResponse(article) : null;
    });
  }

  static async getAdminById(id: string) {
    return ensureConnection(async () => {
      const article = await MarkdownArticleModel.findById(id).exec();
      return article ? toArticleResponse(article) : null;
    });
  }

  static async create(input: MarkdownArticleInput) {
    return ensureConnection(async () => {
      const title = normalizeText(input.title, 160);
      const content = String(input.content ?? "").slice(0, 200000);
      const excerpt = normalizeText(input.excerpt, 500);
      const slug = normalizeText(input.slug || createArticleSlug(title), 120).toLowerCase();

      if (!title) throw new Error("文章标题不能为空");
      if (!content.trim()) throw new Error("Markdown 内容不能为空");
      validateSlug(slug);
      await ensureUniqueSlug(slug);

      const status = input.status === "published" ? "published" : "draft";
      const article = await MarkdownArticleModel.create({
        title,
        slug,
        excerpt,
        content,
        status,
        authorId: normalizeText(input.authorId, 120) || "admin",
        authorName: normalizeText(input.authorName, 120) || "admin",
        publishedAt: status === "published" ? new Date() : null,
      });

      return toArticleResponse(article);
    });
  }

  static async update(id: string, input: Partial<MarkdownArticleInput>) {
    return ensureConnection(async () => {
      const article = await MarkdownArticleModel.findById(id).exec();
      if (!article) return null;

      if (input.title !== undefined) {
        const title = normalizeText(input.title, 160);
        if (!title) throw new Error("文章标题不能为空");
        article.title = title;
      }

      if (input.slug !== undefined) {
        const slug = normalizeText(input.slug, 120).toLowerCase();
        validateSlug(slug);
        await ensureUniqueSlug(slug, id);
        article.slug = slug;
      }

      if (input.excerpt !== undefined) {
        article.excerpt = normalizeText(input.excerpt, 500);
      }

      if (input.content !== undefined) {
        const content = String(input.content ?? "").slice(0, 200000);
        if (!content.trim()) throw new Error("Markdown 内容不能为空");
        article.content = content;
      }

      if (input.status !== undefined) {
        article.status = input.status === "published" ? "published" : "draft";
        article.publishedAt = article.status === "published" ? article.publishedAt || new Date() : null;
      }

      await article.save();
      return toArticleResponse(article);
    });
  }

  static async setStatus(id: string, status: MarkdownArticleStatus) {
    return ensureConnection(async () => {
      const article = await MarkdownArticleModel.findById(id).exec();
      if (!article) return null;

      article.status = status;
      article.publishedAt = status === "published" ? article.publishedAt || new Date() : null;
      await article.save();
      return toArticleResponse(article);
    });
  }

  static async delete(id: string) {
    return ensureConnection(async () => {
      const result = await MarkdownArticleModel.findByIdAndDelete(id).exec();
      return Boolean(result);
    });
  }
}
