import { createContext, use } from 'react';
import type { NotificationData } from './Notification';

export interface LibreChatRealtimeMessage {
    id?: string;
    role: 'user' | 'assistant' | string;
    content: string;
    message?: string;
    timestamp?: string;
    createdAt?: string;
}

export interface LibreChatState {
    rtOpen: boolean;
    token: string;
    rtMessage: string;
    rtSending: boolean;
    rtStreaming: boolean;
    rtError: string;
    rtCanSend: boolean;
    rtHistory: LibreChatRealtimeMessage[];
    rtStreamContent: string;
    MAX_MESSAGE_LEN: number;
}

export interface LibreChatActions {
    closeRealtimeDialog: () => void;
    setToken: (v: string) => void;
    onChangeRtMessage: (v: string) => void;
    handleRealtimeSend: () => void;
    setNotification: (v: NotificationData) => void;
    sanitizeAssistantText: (t: string) => string;
}

export interface LibreChatContextValue {
    state: LibreChatState;
    actions: LibreChatActions;
    meta: Record<string, never>;
}

export const LibreChatContext = createContext<LibreChatContextValue | null>(null);

export function useLibreChat() {
    const ctx = use(LibreChatContext);
    if (!ctx) {
        throw new Error('useLibreChat must be used within a LibreChatProvider');
    }
    return ctx;
}
