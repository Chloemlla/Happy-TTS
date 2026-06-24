import mongoose, { type Document, Schema } from "mongoose";

export type MarkdownArticleStatus = "draft" | "published";

export interface IMarkdownArticle extends Document {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  status: MarkdownArticleStatus;
  authorId: string;
  authorName: string;
  publishedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const MarkdownArticleSchema = new Schema<IMarkdownArticle>(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 120, unique: true },
    excerpt: { type: String, default: "", trim: true, maxlength: 500 },
    content: { type: String, required: true, maxlength: 200000 },
    status: { type: String, enum: ["draft", "published"], default: "draft", index: true },
    authorId: { type: String, required: true, trim: true, maxlength: 120 },
    authorName: { type: String, required: true, trim: true, maxlength: 120 },
    publishedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

MarkdownArticleSchema.index({ slug: 1 }, { unique: true });
MarkdownArticleSchema.index({ status: 1, publishedAt: -1 });
MarkdownArticleSchema.index({ title: "text", excerpt: "text", content: "text" });

export default mongoose.models.MarkdownArticle ||
  mongoose.model<IMarkdownArticle>("MarkdownArticle", MarkdownArticleSchema);
