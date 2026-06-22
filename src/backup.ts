import { clearStoredFiles, exportStoredFiles, importStoredFiles } from "./fileStore";
import { normalizeData } from "./storage";
import type { AppBackup, AppData, Resource } from "./types";

export async function createAppBackup(data: AppData): Promise<AppBackup> {
  const fileIds = data.resources.flatMap((resource) => (resource.fileMeta?.id ? [resource.fileMeta.id] : []));
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    data,
    files: await exportStoredFiles(fileIds),
  };
}

export async function restoreAppBackup(input: unknown): Promise<AppData> {
  const backup = normalizeBackup(input);
  await clearStoredFiles();
  await importStoredFiles(backup.files);
  return backup.data;
}

function normalizeBackup(input: unknown): AppBackup {
  if (!input || typeof input !== "object") {
    throw new Error("Backup file is empty or invalid.");
  }

  const candidate = input as Partial<AppBackup> & Partial<AppData>;
  const data = candidate.data ?? (hasAppDataShape(candidate) ? (candidate as AppData) : undefined);

  if (!data || !Array.isArray(data.resources) || !Array.isArray(data.courses)) {
    throw new Error("Backup file does not contain FocusVault data.");
  }

  return {
    version: 1,
    exportedAt: candidate.exportedAt ?? new Date().toISOString(),
    data: normalizeData({
      courses: data.courses,
      resources: data.resources.map(normalizeResource),
      activityLog: data.activityLog,
      dailyLogs: data.dailyLogs,
      assistantMemory: data.assistantMemory,
      assistantMessages: data.assistantMessages,
      assistantThreads: data.assistantThreads,
    }),
    files: Array.isArray(candidate.files) ? candidate.files : [],
  };
}

function hasAppDataShape(value: unknown): value is AppData {
  return Boolean(
    value &&
      typeof value === "object" &&
      Array.isArray((value as Partial<AppData>).resources) &&
      Array.isArray((value as Partial<AppData>).courses),
  );
}

function normalizeResource(resource: Resource): Resource {
  return {
    ...resource,
    tags: Array.isArray(resource.tags) ? resource.tags : [],
    checklist: Array.isArray(resource.checklist) ? resource.checklist : [],
    progress: Number.isFinite(resource.progress) ? resource.progress : 0,
    revisionCount: Number.isFinite(resource.revisionCount) ? resource.revisionCount : 0,
  };
}
