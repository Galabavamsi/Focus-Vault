import type { AppData } from "./types";
import { sampleData } from "./sampleData";

const STORAGE_KEY = "focus-vault-personal-data-v1";

export function loadData(): AppData {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return sampleData;
  try {
    return normalizeData(JSON.parse(raw) as Partial<AppData>);
  } catch {
    return sampleData;
  }
}

export function saveData(data: AppData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function normalizeData(data: Partial<AppData>): AppData {
  const assistantMessages = Array.isArray(data.assistantMessages) ? data.assistantMessages : [];
  const migratedThreads =
    Array.isArray(data.assistantThreads) && data.assistantThreads.length
      ? data.assistantThreads
      : assistantMessages.length
        ? [
            {
              id: "thread_migrated",
              title: "Previous chat",
              messages: assistantMessages,
              archived: false,
              createdAt: assistantMessages[0]?.createdAt ?? new Date().toISOString(),
              updatedAt: assistantMessages[assistantMessages.length - 1]?.createdAt ?? new Date().toISOString(),
            },
          ]
        : [];

  return {
    ...sampleData,
    ...data,
    courses: Array.isArray(data.courses) ? data.courses : [],
    resources: Array.isArray(data.resources) ? data.resources : [],
    activityLog: Array.isArray(data.activityLog) ? data.activityLog : [],
    dailyLogs: Array.isArray(data.dailyLogs) ? data.dailyLogs : [],
    assistantMemory: {
      ...sampleData.assistantMemory,
      ...(data.assistantMemory ?? {}),
    },
    assistantMessages,
    assistantThreads: migratedThreads,
  };
}
