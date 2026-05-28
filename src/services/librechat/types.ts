export interface ImageRecord {
  updateTime: string;
  updateTimeShanghai?: string;
  imageUrl: string;
}

export interface ChatMessage {
  id: string;
  message: string;
  role?: "user" | "assistant";
  timestamp: string;
  token: string;
  userId?: string;
}

export interface ChatHistory {
  messages: ChatMessage[];
  total: number;
}

export interface PaginationOptions {
  page: number;
  limit: number;
}

export interface SSEClient {
  id: string;
  userId: string;
  token: string;
  res: any;
  lastPing: number;
}
