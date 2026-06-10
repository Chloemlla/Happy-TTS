import "./tts";

declare module "./tts" {
  interface TtsResponse {
    text?: string;
    audioFileId?: string;
    audioStorage?: "file" | "mongo";
    audioMimeType?: string;
    audioSize?: number;
  }

  interface TtsHistoryRecord {
    text?: string;
    audioFileId?: string;
    audioStorage?: "file" | "mongo";
    audioMimeType?: string;
    audioSize?: number;
  }
}
