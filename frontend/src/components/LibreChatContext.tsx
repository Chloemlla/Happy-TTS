import { createContext, use } from 'react';

export interface LibreChatState {
    rtOpen: boolean;
    token: string;
    rtMessage: string;
    rtSending: boolean;
    rtStreaming: boolean;
    rtError: string | null;
    rtCanSend: boolean;
    rtHistory: any[];
    rtStreamContent: string | null;
    MAX_MESSAGE_LEN: number;
}

export interface LibreChatActions {
    closeRealtimeDialog: () => void;
    setToken: (v: string) => void;
    onChangeRtMessage: (v: string) => void;
    handleRealtimeSend: () => void;
    setNotification: (v: any) => void;
    sanitizeAssistantText: (t: string) => string;
}

export interface LibreChatContextValue {
    state: LibreChatState;
    actions: LibreChatActions;
    meta: any;
}

export const LibreChatContext = createContext<LibreChatContextValue | null>(null);

export function useLibreChat() {
    const ctx = use(LibreChatContext);
    if (!ctx) {
        throw new Error('useLibreChat must be used within a LibreChatProvider');
    }
    return ctx;
}
