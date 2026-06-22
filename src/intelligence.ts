import type {
  ActivityEvent,
  AppData,
  AssistantLink,
  AssistantMessage,
  DailyLog,
  Resource,
} from "./types";
import { prettyDate, todayIso, uid } from "./utils";

export type AssistantDraft = {
  content: string;
  links: AssistantLink[];
};

export function activityPoints(log: ActivityEvent[]) {
  return log.reduce((sum, event) => sum + event.points + Math.floor((event.minutes ?? 0) / 25), 0);
}

export function dateKey(value = todayIso()) {
  return new Date(value).toISOString().slice(0, 10);
}

export function eventsByDate(events: ActivityEvent[]) {
  return events.reduce<Record<string, ActivityEvent[]>>((acc, event) => {
    const key = dateKey(event.createdAt);
    acc[key] = [...(acc[key] ?? []), event];
    return acc;
  }, {});
}

export function lastNDays(days: number) {
  const result: string[] = [];
  const date = new Date();
  for (let index = days - 1; index >= 0; index -= 1) {
    const copy = new Date(date);
    copy.setDate(date.getDate() - index);
    result.push(dateKey(copy.toISOString()));
  }
  return result;
}

export function contributionLevel(points: number) {
  if (points <= 0) return 0;
  if (points < 3) return 1;
  if (points < 7) return 2;
  if (points < 12) return 3;
  return 4;
}

export function currentStreak(events: ActivityEvent[]) {
  const grouped = eventsByDate(events);
  let streak = 0;
  const cursor = new Date();
  while (grouped[dateKey(cursor.toISOString())]?.length) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function buildAssistantContext(data: AppData) {
  const active = data.resources.filter((item) => item.status === "active");
  const due = data.resources.filter((item) => item.status !== "done" && item.nextReviewAt && new Date(item.nextReviewAt) <= endOfToday());
  const inbox = data.resources.filter((item) => item.status === "inbox" || item.status === "queued");
  const archived = data.resources.filter((item) => item.status === "done");
  const recentEvents = [...data.activityLog].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 12);
  const todayLog = data.dailyLogs.find((log) => log.date === dateKey());

  return {
    totals: {
      resources: data.resources.length,
      courses: data.courses.length,
      active: active.length,
      due: due.length,
      inbox: inbox.length,
      archived: archived.length,
      streak: currentStreak(data.activityLog),
    },
    active: active.map(compactResource),
    due: due.map(compactResource),
    inbox: inbox.slice(0, 8).map(compactResource),
    courses: data.courses.map((course) => ({
      id: course.id,
      title: course.title,
      currentModule: course.currentModule,
      goal: course.goal,
      targetDate: course.targetDate,
    })),
    recentEvents,
    todayLog,
    memory: data.assistantMemory,
  };
}

export function makeLocalAssistantReply(prompt: string, data: AppData): AssistantDraft {
  const normalized = prompt.toLowerCase();
  if (normalized.includes("finish") || normalized.includes("done") || normalized.includes("week")) {
    return finishedSummary(data);
  }
  if (normalized.includes("archive")) {
    return archiveSummary(data);
  }
  if (normalized.includes("activity") || normalized.includes("progress") || normalized.includes("streak")) {
    return activitySummary(data);
  }
  return nextActionSummary(data);
}

export function parseAiAssistantReply(content: string, fallback: AssistantDraft): AssistantDraft {
  try {
    const parsed = JSON.parse(content) as Partial<AssistantDraft>;
    return {
      content: parsed.content || fallback.content,
      links: Array.isArray(parsed.links) ? parsed.links : fallback.links,
    };
  } catch {
    return { content: content || fallback.content, links: fallback.links };
  }
}

export function assistantSystemPrompt() {
  return [
    "You are FocusVault's helper bot inside a personal study/work desktop app.",
    "Be concise and practical. Use the provided app context only.",
    "Return strict JSON with shape: {\"content\":\"...\",\"links\":[{\"label\":\"...\",\"target\":{\"view\":\"today|dump|inbox|courses|library|goals|review|insights|progress|timeline|archive|assistant\",\"resourceId\":\"optional\",\"courseId\":\"optional\",\"date\":\"optional\"}}]}.",
    "Include clickable links for items, courses, archive, timeline, review, or daily activity whenever useful.",
  ].join(" ");
}

export function makeAssistantMessage(content: string, role: AssistantMessage["role"], links: AssistantLink[] = []): AssistantMessage {
  return { id: uid("msg"), role, content, links, createdAt: todayIso() };
}

export function dailyLogPoints(log: DailyLog) {
  return Math.floor(log.studyMinutes / 25) + log.codingProblems * 2 + log.pagesRead + log.videosCompleted * 3 + log.revisionsDone * 2;
}

function nextActionSummary(data: AppData): AssistantDraft {
  const due = data.resources.filter((item) => item.status !== "done" && item.nextReviewAt && new Date(item.nextReviewAt) <= endOfToday());
  const active = data.resources.filter((item) => item.status === "active");
  const queued = data.resources.filter((item) => item.status === "inbox" || item.status === "queued");
  const picks = [...due, ...active, ...queued].slice(0, 4);
  const lines = picks.length
    ? picks.map((item, index) => `${index + 1}. ${item.title} (${item.status}, ${item.progress}% done)`).join("\n")
    : "Your vault is clear. Capture one task, one link, or one study material to start today's chain.";

  return {
    content: picks.length ? `Here is a clean next queue:\n${lines}` : lines,
    links: [
      ...picks.map((item) => ({ label: `Open ${item.title}`, target: { view: "today", resourceId: item.id } })),
      ...(due.length ? [{ label: "Open review queue", target: { view: "review" } }] : []),
    ],
  };
}

function finishedSummary(data: AppData): AssistantDraft {
  const completed = data.resources.filter((item) => item.status === "done").slice(0, 6);
  const recent = data.activityLog.filter((event) => event.type === "completed" || event.type === "archived").slice(-8).reverse();
  return {
    content:
      completed.length || recent.length
        ? `You have ${completed.length} completed items in the archive. Recent wins:\n${recent.map((event) => `- ${event.title}`).join("\n") || "- No logged completions yet."}`
        : "No completed items yet. Finish one small thing today and your archive will start filling.",
    links: [
      { label: "Open archive", target: { view: "archive" } },
      { label: "Open timeline", target: { view: "timeline" } },
    ],
  };
}

function archiveSummary(data: AppData): AssistantDraft {
  const archived = data.resources.filter((item) => item.status === "done");
  return {
    content: archived.length
      ? `Your archive has ${archived.length} finished item${archived.length === 1 ? "" : "s"}. This is your proof shelf.`
      : "Your archive is empty for now. Mark finished resources as done and they will collect here.",
    links: [{ label: "View archive", target: { view: "archive" } }],
  };
}

function activitySummary(data: AppData): AssistantDraft {
  const grouped = eventsByDate(data.activityLog);
  const todayEvents = grouped[dateKey()] ?? [];
  const weekPoints = lastNDays(7).reduce((sum, key) => sum + activityPoints(grouped[key] ?? []), 0);
  return {
    content: `Current streak: ${currentStreak(data.activityLog)} day${currentStreak(data.activityLog) === 1 ? "" : "s"}.\nToday: ${todayEvents.length} event${todayEvents.length === 1 ? "" : "s"}.\nLast 7 days: ${weekPoints} progress points.`,
    links: [
      { label: "Open progress grid", target: { view: "progress" } },
      { label: "Open timeline", target: { view: "timeline" } },
    ],
  };
}

function compactResource(item: Resource) {
  return {
    id: item.id,
    title: item.title,
    type: item.type,
    status: item.status,
    courseId: item.courseId,
    progress: item.progress,
    resumeLabel: item.resumeLabel,
    nextReviewAt: item.nextReviewAt ? prettyDate(item.nextReviewAt) : undefined,
    tags: item.tags,
  };
}

function endOfToday() {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return today;
}
