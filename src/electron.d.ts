import type { AIProviderSettings } from "./types";

declare global {
  interface Window {
    focusVaultAI?: {
      getSettings: () => Promise<AIProviderSettings>;
      saveSettings: (
        settings: Omit<AIProviderSettings, "hasApiKey"> & { apiKey?: string },
      ) => Promise<AIProviderSettings>;
      chat: (payload: {
        messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
        temperature?: number;
        responseFormat?: { type: "json_object" };
      }) => Promise<{ content: string; raw?: unknown }>;
    };
  }
}

export {};
