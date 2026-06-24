import api from './api';

export type MarkdownArticleStatus = 'draft' | 'published';

export interface MarkdownArticleSummary {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  status: MarkdownArticleStatus;
  authorName?: string;
  publishedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface MarkdownArticle extends MarkdownArticleSummary {
  content: string;
  authorId?: string;
}

export interface MarkdownArticlePayload {
  title: string;
  slug?: string;
  excerpt?: string;
  content: string;
  status?: MarkdownArticleStatus;
}

const unwrap = <T>(response: { data: T }) => response.data;

export const markdownArticleApi = {
  async listPublished() {
    return unwrap(await api.get<{ success: boolean; articles: MarkdownArticleSummary[] }>('/api/articles'));
  },

  async getPublished(slug: string) {
    return unwrap(await api.get<{ success: boolean; article: MarkdownArticle }>(`/api/articles/${slug}`));
  },

  async listAdmin() {
    return unwrap(await api.get<{ success: boolean; articles: MarkdownArticleSummary[] }>('/api/articles/admin/all'));
  },

  async getAdmin(id: string) {
    return unwrap(await api.get<{ success: boolean; article: MarkdownArticle }>(`/api/articles/admin/${id}`));
  },

  async create(payload: MarkdownArticlePayload) {
    return unwrap(await api.post<{ success: boolean; article: MarkdownArticle }>('/api/articles', payload));
  },

  async update(id: string, payload: MarkdownArticlePayload) {
    return unwrap(await api.put<{ success: boolean; article: MarkdownArticle }>(`/api/articles/admin/${id}`, payload));
  },

  async setStatus(id: string, status: MarkdownArticleStatus) {
    return unwrap(await api.patch<{ success: boolean; article: MarkdownArticle }>(`/api/articles/admin/${id}/status`, { status }));
  },

  async remove(id: string) {
    return unwrap(await api.delete<{ success: boolean }>(`/api/articles/admin/${id}`));
  },
};
