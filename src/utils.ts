import type { CapturePayload, Resource, ResourceType } from "./types";

export function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}_${Date.now().toString(36)}`;
}

export function todayIso() {
  return new Date().toISOString();
}

export function dateInDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

export function prettyDate(value?: string) {
  if (!value) return "No date";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value));
}

export function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function inferType(input: string, fallback: ResourceType = "note"): ResourceType {
  const value = input.toLowerCase();
  if (value.includes("youtube.com/playlist") || value.includes("list=")) return "playlist";
  if (value.includes("youtube.com") || value.includes("youtu.be")) return "video";
  if (value.includes("drive.google.com") || value.includes("docs.google.com")) return "file";
  if (value.endsWith(".pdf")) return "pdf";
  if (value.includes("arxiv.org") || value.includes("doi.org")) return "paper";
  if (value.startsWith("http")) return "article";
  return fallback;
}

export function isGoogleWorkspaceUrl(url?: string) {
  if (!url) return false;
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    return hostname === "drive.google.com" || hostname.endsWith(".google.com") && hostname.startsWith("docs.");
  } catch {
    return false;
  }
}

export function youtubeThumbnail(url?: string) {
  if (!url) return undefined;
  const patterns = [
    /youtu\.be\/([A-Za-z0-9_-]{6,})/,
    /youtube\.com\/watch\?v=([A-Za-z0-9_-]{6,})/,
    /youtube\.com\/embed\/([A-Za-z0-9_-]{6,})/,
    /youtube\.com\/shorts\/([A-Za-z0-9_-]{6,})/,
  ];
  const match = patterns.map((pattern) => url.match(pattern)?.[1]).find(Boolean);
  return match ? `https://img.youtube.com/vi/${match}/hqdefault.jpg` : undefined;
}

export function faviconFor(url?: string) {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${parsed.hostname}&sz=128`;
  } catch {
    return undefined;
  }
}

export function thumbnailFor(type: ResourceType, url?: string) {
  if (isGoogleWorkspaceUrl(url)) return "google-drive";
  return youtubeThumbnail(url) ?? faviconFor(url) ?? type;
}

export function resourceFromCapture(payload: CapturePayload): Resource {
  const url = payload.url?.trim();
  const type = payload.type ?? inferType(url ?? payload.title ?? "");
  const now = todayIso();
  return {
    id: uid("res"),
    title: payload.title?.trim() || url || "Untitled capture",
    type,
    status: "inbox",
    sourceUrl: url,
    thumbnail: payload.thumbnail || thumbnailFor(type, url),
    group: "Knowledge dump",
    tags: [],
    notes: "",
    checklist: [],
    progress: 0,
    revisionCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export function decodeCaptureParam(value: string | null): CapturePayload | null {
  if (!value) return null;
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(escape(atob(normalized)));
    return JSON.parse(json);
  } catch {
    try {
      return JSON.parse(decodeURIComponent(value));
    } catch {
      return null;
    }
  }
}
