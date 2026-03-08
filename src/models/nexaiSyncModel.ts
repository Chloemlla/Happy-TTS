/**
 * NexAI 云同步数据模型
 * 每个用户一个文档，聚合所有同步数据
 */
import { mongoose } from "../services/mongoService";

// ── 子文档 Schema ──

const noteSchema = new mongoose.Schema(
    {
        id: { type: String, required: true },
        title: { type: String, default: "" },
        content: { type: String, default: "" },
        createdAt: { type: String, required: true },
        updatedAt: { type: String, required: true },
        lastViewedAt: { type: String },
        isStarred: { type: Boolean, default: false },
    },
    { _id: false },
);

const messageSchema = new mongoose.Schema(
    {
        role: { type: String, required: true },
        content: { type: String, required: true },
        timestamp: { type: String, required: true },
        isError: { type: Boolean, default: false },
    },
    { _id: false },
);

const conversationSchema = new mongoose.Schema(
    {
        id: { type: String, required: true },
        title: { type: String, default: "" },
        messages: { type: [messageSchema], default: [] },
        createdAt: { type: String, required: true },
    },
    { _id: false },
);

const translationRecordSchema = new mongoose.Schema(
    {
        id: { type: String, required: true },
        sourceLanguage: { type: String, required: true },
        targetLanguage: { type: String, required: true },
        sourceText: { type: String, required: true },
        translatedText: { type: String, required: true },
        createdAt: { type: String, required: true },
    },
    { _id: false },
);

const savedPasswordSchema = new mongoose.Schema(
    {
        id: { type: String, required: true },
        password: { type: String, required: true },
        category: { type: String, default: "" },
        note: { type: String, default: "" },
        createdAt: { type: String, required: true },
        strength: { type: Number, default: 0 },
    },
    { _id: false },
);

const shortUrlRecordSchema = new mongoose.Schema(
    {
        id: { type: String, required: true },
        originalUrl: { type: String, required: true },
        shortUrl: { type: String, required: true },
        createdAt: { type: String, required: true },
    },
    { _id: false },
);

const settingsSchema = new mongoose.Schema(
    {
        baseUrl: { type: String, default: "https://api.openai.com/v1" },
        apiKey: { type: String, default: "" },
        models: { type: String, default: "gpt-4o,gpt-4o-mini,gpt-4-turbo,gpt-3.5-turbo" },
        selectedModel: { type: String, default: "gpt-4o" },
        themeMode: { type: String, default: "system" },
        temperature: { type: Number, default: 0.7 },
        maxTokens: { type: Number, default: 4096 },
        systemPrompt: { type: String, default: "" },
        accentColorValue: { type: Number },
        fontSize: { type: Number, default: 14.0 },
        fontFamily: { type: String, default: "System" },
        borderlessMode: { type: Boolean, default: false },
        fullScreenMode: { type: Boolean, default: false },
        smartAutoScroll: { type: Boolean, default: true },
        syncEnabled: { type: Boolean, default: false },
        syncMethod: { type: String, default: "WebDAV" },
        webdavServer: { type: String, default: "" },
        webdavUser: { type: String, default: "" },
        webdavPassword: { type: String, default: "" },
        upstashUrl: { type: String, default: "" },
        upstashToken: { type: String, default: "" },
        vertexApiKey: { type: String, default: "" },
        apiMode: { type: String, default: "OpenAI" },
        vertexProjectId: { type: String, default: "" },
        vertexLocation: { type: String, default: "global" },
        notesAutoSave: { type: Boolean, default: true },
        aiTitleGeneration: { type: Boolean, default: true },
    },
    { _id: false },
);

// ── 主 Schema ──

const nexaiSyncSchema = new mongoose.Schema(
    {
        userId: { type: String, required: true, unique: true, index: true },
        settings: { type: settingsSchema, default: () => ({}) },
        notes: { type: [noteSchema], default: [] },
        conversations: { type: [conversationSchema], default: [] },
        translationHistory: { type: [translationRecordSchema], default: [] },
        savedPasswords: { type: [savedPasswordSchema], default: [] },
        shortUrls: { type: [shortUrlRecordSchema], default: [] },
        lastSyncedAt: { type: Date, default: Date.now },
    },
    {
        collection: "nexai_sync",
        timestamps: true,
    },
);

export const NexaiSyncModel =
    mongoose.models.NexaiSync || mongoose.model("NexaiSync", nexaiSyncSchema);

// ── 类型定义 ──

export interface INexaiSyncSettings {
    baseUrl?: string;
    apiKey?: string;
    models?: string;
    selectedModel?: string;
    themeMode?: string;
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
    accentColorValue?: number | null;
    fontSize?: number;
    fontFamily?: string;
    borderlessMode?: boolean;
    fullScreenMode?: boolean;
    smartAutoScroll?: boolean;
    syncEnabled?: boolean;
    syncMethod?: string;
    webdavServer?: string;
    webdavUser?: string;
    webdavPassword?: string;
    upstashUrl?: string;
    upstashToken?: string;
    vertexApiKey?: string;
    apiMode?: string;
    vertexProjectId?: string;
    vertexLocation?: string;
    notesAutoSave?: boolean;
    aiTitleGeneration?: boolean;
}

export interface INexaiNote {
    id: string;
    title: string;
    content: string;
    createdAt: string;
    updatedAt: string;
    lastViewedAt?: string;
    isStarred: boolean;
}

export interface INexaiMessage {
    role: string;
    content: string;
    timestamp: string;
    isError: boolean;
}

export interface INexaiConversation {
    id: string;
    title: string;
    messages: INexaiMessage[];
    createdAt: string;
}

export interface INexaiTranslationRecord {
    id: string;
    sourceLanguage: string;
    targetLanguage: string;
    sourceText: string;
    translatedText: string;
    createdAt: string;
}

export interface INexaiSavedPassword {
    id: string;
    password: string;
    category: string;
    note: string;
    createdAt: string;
    strength: number;
}

export interface INexaiShortUrlRecord {
    id: string;
    originalUrl: string;
    shortUrl: string;
    createdAt: string;
}

export interface INexaiSyncData {
    userId: string;
    settings: INexaiSyncSettings;
    notes: INexaiNote[];
    conversations: INexaiConversation[];
    translationHistory: INexaiTranslationRecord[];
    savedPasswords: INexaiSavedPassword[];
    shortUrls: INexaiShortUrlRecord[];
    lastSyncedAt: Date;
    createdAt?: Date;
    updatedAt?: Date;
}

export type SyncCategory =
    | "settings"
    | "notes"
    | "conversations"
    | "translations"
    | "passwords"
    | "shortUrls";
