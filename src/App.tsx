import {
  AlarmClock,
  Archive,
  BarChart3,
  Bell,
  BookOpen,
  Bot,
  CalendarDays,
  ChevronDown,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Download,
  ExternalLink,
  FileImage,
  FileText,
  FolderPlus,
  Goal,
  GraduationCap,
  Image,
  History,
  Layers3,
  Link2,
  ListChecks,
  MessageSquare,
  Moon,
  NotebookPen,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Search,
  Send,
  Settings,
  Sun,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { ChangeEvent, FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { createAppBackup, restoreAppBackup } from "./backup";
import { clearStoredFiles, deleteStoredFile, getStoredFile, putStoredFile } from "./fileStore";
import {
  activityPoints,
  assistantSystemPrompt,
  buildAssistantContext,
  contributionLevel,
  currentStreak,
  dailyLogPoints,
  dateKey,
  eventsByDate,
  lastNDays,
  makeAssistantMessage,
  makeLocalAssistantReply,
  parseAiAssistantReply,
} from "./intelligence";
import { sampleData } from "./sampleData";
import { loadData, saveData } from "./storage";
import type {
  ActivityCategory,
  ActivityEvent,
  ActivityType,
  AIProviderSettings,
  AppData,
  AssistantLink,
  AssistantThread,
  Course,
  DailyLog,
  Resource,
  ResourceStatus,
  ResourceType,
} from "./types";
import {
  dateInDays,
  decodeCaptureParam,
  formatFileSize,
  inferType,
  prettyDate,
  resourceFromCapture,
  thumbnailFor,
  todayIso,
  uid,
} from "./utils";

type ViewKey =
  | "today"
  | "dump"
  | "inbox"
  | "courses"
  | "library"
  | "goals"
  | "review"
  | "progress"
  | "timeline"
  | "archive"
  | "assistant"
  | "insights";
type Theme = "light" | "dark";

const viewSections: Array<{ title: string; items: Array<{ key: ViewKey; label: string; icon: typeof BookOpen }> }> = [
  {
    title: "Capture",
    items: [
      { key: "today", label: "Today", icon: Clock3 },
      { key: "inbox", label: "Inbox", icon: Archive },
      { key: "dump", label: "Links", icon: Link2 },
    ],
  },
  {
    title: "Study",
    items: [
      { key: "courses", label: "Courses", icon: GraduationCap },
      { key: "library", label: "Library", icon: Layers3 },
      { key: "goals", label: "Plans", icon: Goal },
      { key: "review", label: "Revise", icon: RotateCcw },
    ],
  },
  {
    title: "Track",
    items: [
      { key: "progress", label: "Logger", icon: CalendarDays },
      { key: "timeline", label: "History", icon: History },
      { key: "archive", label: "Done", icon: CheckCircle2 },
      { key: "insights", label: "Stats", icon: BarChart3 },
    ],
  },
  {
    title: "AI",
    items: [{ key: "assistant", label: "Assistant", icon: Bot }],
  },
];

const typeLabels: Record<ResourceType, string> = {
  video: "Video",
  playlist: "Playlist",
  article: "Article",
  paper: "Paper",
  pdf: "PDF",
  slides: "Slides",
  image: "Image",
  task: "Task",
  goal: "Goal",
  note: "Note",
  file: "File",
};

const statusLabels: Record<ResourceStatus, string> = {
  inbox: "Inbox",
  queued: "Queued",
  active: "Active",
  paused: "Paused",
  done: "Done",
};

const courseColors = ["#5b8def", "#14a38b", "#d97706", "#c2416b", "#6d5bd0", "#d6ff72"];
const detailViewKeys: ViewKey[] = ["today", "dump", "inbox", "courses", "library", "goals", "review"];
const statsViewKeys: ViewKey[] = ["today", "dump", "inbox", "library", "review"];
const captureViewKeys: ViewKey[] = ["today", "dump", "inbox", "library"];

export function App() {
  const [data, setData] = useState<AppData>(() => loadData());
  const [view, setView] = useState<ViewKey>("today");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string>(() => loadData().resources[0]?.id ?? "");
  const [captureText, setCaptureText] = useState("");
  const [captureTitle, setCaptureTitle] = useState("");
  const [courseTitle, setCourseTitle] = useState("");
  const [newCheckText, setNewCheckText] = useState("");
  const [notice, setNotice] = useState("");
  const [assistantPrompt, setAssistantPrompt] = useState("");
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [activeAssistantThreadId, setActiveAssistantThreadId] = useState("");
  const [assistantOverlayOpen, setAssistantOverlayOpen] = useState(false);
  const [assistantSettingsOpen, setAssistantSettingsOpen] = useState(false);
  const [dailyDraft, setDailyDraft] = useState<DailyLog>(() => emptyDailyLog());
  const [providerDraft, setProviderDraft] = useState<Omit<AIProviderSettings, "hasApiKey"> & { apiKey?: string }>({
    provider: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-chat",
    apiKey: "",
  });
  const [providerStatus, setProviderStatus] = useState<AIProviderSettings | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const notificationKeyRef = useRef("");
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(() =>
    typeof Notification === "undefined" ? "default" : Notification.permission,
  );
  const [theme, setTheme] = useState<Theme>(() => {
    const savedTheme = localStorage.getItem("focus-vault-theme");
    if (savedTheme === "dark" || savedTheme === "light") return savedTheme;
    return "dark";
  });

  useEffect(() => saveData(data), [data]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("focus-vault-theme", theme);
  }, [theme]);

  useEffect(() => {
    window.focusVaultAI
      ?.getSettings()
      .then((settings) => {
        setProviderStatus(settings);
        setProviderDraft({
          provider: settings.provider,
          name: settings.name,
          baseUrl: settings.baseUrl,
          model: settings.model,
          apiKey: "",
        });
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const today = dateKey();
    setDailyDraft(data.dailyLogs.find((log) => log.date === today) ?? emptyDailyLog(today));
  }, [data.dailyLogs]);

  useEffect(() => {
    if (activeAssistantThreadId && data.assistantThreads.some((thread) => thread.id === activeAssistantThreadId)) return;
    const nextThread = data.assistantThreads.find((thread) => !thread.archived) ?? data.assistantThreads[0];
    setActiveAssistantThreadId(nextThread?.id ?? "");
  }, [activeAssistantThreadId, data.assistantThreads]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (notificationPermission !== "granted" || typeof Notification === "undefined") return;

    function notifyDueReviews() {
      const due = data.resources.filter((item) => item.status !== "done" && isDue(item.nextReviewAt));
      if (!due.length) return;

      const todayKey = new Date().toISOString().slice(0, 10);
      const key = `${todayKey}:${due.map((item) => item.id).sort().join(",")}`;
      if (notificationKeyRef.current === key || localStorage.getItem("focus-vault-review-notice") === key) return;

      notificationKeyRef.current = key;
      localStorage.setItem("focus-vault-review-notice", key);
      new Notification("FocusVault review due", {
        body: `${due.length} item${due.length === 1 ? "" : "s"} need revision today.`,
      });
    }

    notifyDueReviews();
    const timer = window.setInterval(notifyDueReviews, 60_000);
    return () => window.clearInterval(timer);
  }, [data.resources, notificationPermission]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payload = decodeCaptureParam(params.get("capture"));
    if (!payload) return;

    const resource = resourceFromCapture(payload);
    const existing = resource.sourceUrl ? data.resources.find((item) => item.sourceUrl === resource.sourceUrl) : undefined;
    if (existing) {
      setSelectedId(existing.id);
      setView("dump");
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }

    setData((current) => {
      if (resource.sourceUrl && current.resources.some((item) => item.sourceUrl === resource.sourceUrl)) {
        return current;
      }
      return {
        ...current,
        resources: [resource, ...current.resources],
        activityLog: [
          {
            id: uid("act"),
            type: "captured",
            title: `Captured ${resource.title}`,
            resourceId: resource.id,
            category: categoryForResource(resource),
            points: 1,
            createdAt: todayIso(),
          },
          ...current.activityLog,
        ],
      };
    });
    setSelectedId(resource.id);
    setView("dump");
    window.history.replaceState({}, "", window.location.pathname);
  }, [data.resources]);

  const selected = data.resources.find((item) => item.id === selectedId) ?? data.resources[0];

  const stats = useMemo(() => {
    const total = data.resources.length;
    const averageDivisor = total || 1;
    const done = data.resources.filter((item) => item.status === "done").length;
    const active = data.resources.filter((item) => item.status === "active").length;
    const review = data.resources.filter((item) => item.status !== "done" && isDue(item.nextReviewAt)).length;
    const avgProgress = Math.round(data.resources.reduce((sum, item) => sum + item.progress, 0) / averageDivisor);
    return { total, done, active, review, avgProgress };
  }, [data.resources]);

  const filteredResources = useMemo(() => {
    const search = query.trim().toLowerCase();
    return data.resources.filter((item) => {
      const inView =
        view === "today"
          ? item.status === "active" || isDue(item.nextReviewAt)
          : view === "dump"
            ? isDumpItem(item)
          : view === "inbox"
            ? item.status === "inbox"
            : view === "courses"
              ? Boolean(item.courseId)
              : view === "goals"
                ? item.type === "goal" || item.type === "task"
          : view === "review"
                  ? item.status !== "done" && isDue(item.nextReviewAt)
                  : true;

      const inSearch =
        !search ||
        item.title.toLowerCase().includes(search) ||
        item.tags.join(" ").toLowerCase().includes(search) ||
        item.notes.toLowerCase().includes(search);

      return inView && inSearch;
    });
  }, [data.resources, query, view]);

  const visibleSelected = filteredResources.some((item) => item.id === selected?.id) ? selected : undefined;

  function commitData(updater: (current: AppData) => AppData) {
    setData((current) => updater(current));
  }

  function makeActivity(
    type: ActivityType,
    title: string,
    options: {
      resourceId?: string;
      courseId?: string;
      category?: ActivityCategory;
      points?: number;
      minutes?: number;
    } = {},
  ): ActivityEvent {
    return {
      id: uid("act"),
      type,
      title,
      resourceId: options.resourceId,
      courseId: options.courseId,
      category: options.category ?? "general",
      points: options.points ?? pointsFor(type),
      minutes: options.minutes,
      createdAt: todayIso(),
    };
  }

  function appendActivity(current: AppData, event: ActivityEvent): AppData {
    return { ...current, activityLog: [event, ...current.activityLog] };
  }

  function updateResource(id: string, patch: Partial<Resource>) {
    const existing = data.resources.find((item) => item.id === id);
    commitData((current) => ({
      ...current,
      resources: current.resources.map((item) => (item.id === id ? { ...item, ...patch, updatedAt: todayIso() } : item)),
      activityLog:
        patch.status === "done" && existing?.status !== "done"
          ? [
              makeActivity("completed", `Completed ${existing?.title ?? "item"}`, {
                resourceId: id,
                category: categoryForResource(existing),
                points: 4,
              }),
              ...current.activityLog,
            ]
          : patch.status && existing?.status === "done"
            ? [
                makeActivity("unarchived", `Reopened ${existing?.title ?? "item"}`, {
                  resourceId: id,
                  category: categoryForResource(existing),
                  points: 1,
                }),
                ...current.activityLog,
              ]
            : current.activityLog,
    }));
  }

  function addResource(resource: Resource) {
    const existing = resource.sourceUrl ? data.resources.find((item) => item.sourceUrl === resource.sourceUrl) : undefined;
    if (existing) {
      setSelectedId(existing.id);
      setView("dump");
      setNotice("That link is already saved.");
      return;
    }

    commitData((current) =>
      appendActivity(
        { ...current, resources: [resource, ...current.resources] },
        makeActivity("captured", `Captured ${resource.title}`, {
          resourceId: resource.id,
          category: categoryForResource(resource),
        }),
      ),
    );
    setSelectedId(resource.id);
  }

  function handleQuickCapture(event: FormEvent) {
    event.preventDefault();
    const raw = captureText.trim();
    if (!raw && !captureTitle.trim()) return;
    const type = inferType(raw || captureTitle, "note");
    const resource = resourceFromCapture({
      title: captureTitle || raw,
      url: raw.startsWith("http") ? raw : undefined,
      type,
      thumbnail: thumbnailFor(type, raw),
    });
    addResource(resource);
    setCaptureText("");
    setCaptureTitle("");
    setView("dump");
  }

  function createCourse(event: FormEvent) {
    event.preventDefault();
    const title = courseTitle.trim();
    if (!title) return;
    const course: Course = {
      id: uid("course"),
      title,
      color: courseColors[data.courses.length % courseColors.length],
      goal: "Collect materials, track progress, and revise on schedule.",
      currentModule: "Getting organized",
      createdAt: todayIso(),
      updatedAt: todayIso(),
    };
    commitData((current) =>
      appendActivity(
        { ...current, courses: [course, ...current.courses] },
        makeActivity("created_course", `Created course ${course.title}`, { courseId: course.id, category: "course", points: 3 }),
      ),
    );
    setCourseTitle("");
    setView("courses");
  }

  async function handleFiles(event: ChangeEvent<HTMLInputElement>, courseId?: string) {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;

    try {
      const resources = await Promise.all(
        files.map(async (file) => {
          const type = fileType(file);
          const fileId = uid("file");
          const stored = await putStoredFile(fileId, file);
          const thumbnail = type === "image" ? await makeImageThumbnail(file) : type;
          return {
            id: uid("res"),
            title: file.name.replace(/\.[^.]+$/, ""),
            type,
            status: "inbox",
            courseId,
            thumbnail,
            tags: [type],
            notes: "",
            checklist: [],
            progress: 0,
            resumeLabel: type === "slides" ? "Slide 1" : type === "pdf" ? "Page 1" : undefined,
            revisionCount: 0,
            createdAt: todayIso(),
            updatedAt: todayIso(),
            fileMeta: { id: stored.id, name: stored.name, size: stored.size, mime: stored.mime },
          } satisfies Resource;
        }),
      );

      commitData((current) => ({
        ...current,
        resources: [...resources, ...current.resources],
        activityLog: [
          ...resources.map((resource) =>
            makeActivity("uploaded", `Uploaded ${resource.fileMeta?.name ?? resource.title}`, {
              resourceId: resource.id,
              courseId: resource.courseId,
              category: categoryForResource(resource),
              points: 2,
            }),
          ),
          ...current.activityLog,
        ],
      }));
      setSelectedId(resources[0]?.id ?? selectedId);
      setNotice(`${resources.length} file${resources.length === 1 ? "" : "s"} added to FocusVault.`);
      if (courseId) setView("courses");
    } catch (error) {
      console.error(error);
      setNotice(error instanceof Error ? error.message : "Could not save the selected files.");
    } finally {
      event.target.value = "";
    }
  }

  function updateCourse(id: string, patch: Partial<Course>) {
    commitData((current) => ({
      ...current,
      courses: current.courses.map((course) =>
        course.id === id ? { ...course, ...patch, updatedAt: todayIso() } : course,
      ),
    }));
  }

  function deleteCourse(id: string) {
    const course = data.courses.find((item) => item.id === id);
    if (!course || !window.confirm(`Delete "${course.title}" course tile? Materials stay in your library.`)) return;

    commitData((current) => ({
      ...current,
      courses: current.courses.filter((item) => item.id !== id),
      resources: current.resources.map((item) =>
        item.courseId === id ? { ...item, courseId: undefined, updatedAt: todayIso() } : item,
      ),
    }));
    setNotice("Course deleted. Its materials are still saved.");
  }

  async function deleteResource(id: string) {
    const resource = data.resources.find((item) => item.id === id);
    if (!resource || !window.confirm(`Delete "${resource.title}" from FocusVault?`)) return;

    try {
      if (resource.fileMeta?.id) await deleteStoredFile(resource.fileMeta.id);
      const nextVisibleResource = filteredResources.find((item) => item.id !== id);
      const nextResource = nextVisibleResource ?? data.resources.find((item) => item.id !== id);
      commitData((current) => ({ ...current, resources: current.resources.filter((item) => item.id !== id) }));
      setSelectedId(nextResource?.id ?? "");
      setNotice("Item deleted.");
    } catch (error) {
      console.error(error);
      setNotice("Could not delete the stored file.");
    }
  }

  async function openResource(resource: Resource) {
    if (resource.fileMeta?.id) {
      try {
        const record = await getStoredFile(resource.fileMeta.id);
        if (!record) {
          setNotice("The local file is missing. Import a backup or re-add it.");
          return;
        }
        const url = URL.createObjectURL(record.blob);
        window.open(url, "_blank", "noopener,noreferrer");
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } catch (error) {
        console.error(error);
        setNotice("Could not open the stored file.");
      }
      return;
    }

    if (resource.sourceUrl) {
      window.open(resource.sourceUrl, "_blank", "noopener,noreferrer");
    }
  }

  async function enableNotifications() {
    if (typeof Notification === "undefined") {
      setNotice("This browser does not support notifications.");
      return;
    }

    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    setNotice(permission === "granted" ? "Review alerts enabled." : "Notifications are blocked.");
  }

  async function exportBackup() {
    try {
      const backup = await createAppBackup(data);
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `focusvault-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setNotice("Backup exported with your saved file attachments.");
    } catch (error) {
      console.error(error);
      setNotice("Could not export backup.");
    }
  }

  async function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const restored = await restoreAppBackup(JSON.parse(await file.text()));
      setData(restored);
      setSelectedId(restored.resources[0]?.id ?? "");
      setNotice("Backup imported.");
    } catch (error) {
      console.error(error);
      setNotice(error instanceof Error ? error.message : "Could not import backup.");
    } finally {
      event.target.value = "";
    }
  }

  async function resetVault() {
    if (!window.confirm("Clear FocusVault and remove locally stored file attachments?")) return;

    await clearStoredFiles();
    setData(sampleData);
    setSelectedId(sampleData.resources[0]?.id ?? "");
    setView("today");
    setNotice("FocusVault cleared.");
  }

  function saveDailyLog(event: FormEvent) {
    event.preventDefault();
    const now = todayIso();
    const log: DailyLog = { ...dailyDraft, updatedAt: now, createdAt: dailyDraft.createdAt || now };
    const points = dailyLogPoints(log);
    commitData((current) => {
      const exists = current.dailyLogs.some((item) => item.date === log.date);
      return appendActivity(
        {
          ...current,
          dailyLogs: exists ? current.dailyLogs.map((item) => (item.date === log.date ? log : item)) : [log, ...current.dailyLogs],
        },
        makeActivity("logged_study", `Logged ${log.studyMinutes} study minutes and ${log.codingProblems} coding problems`, {
          category: log.codingProblems ? "coding" : "general",
          points,
          minutes: log.studyMinutes,
        }),
      );
    });
    setNotice("Daily log saved.");
  }

  async function saveProviderSettings(event: FormEvent) {
    event.preventDefault();
    if (!window.focusVaultAI) {
      setNotice("AI settings are available in the desktop app.");
      return;
    }

    try {
      const settings = await window.focusVaultAI.saveSettings(providerDraft);
      setProviderStatus(settings);
      setProviderDraft({ ...providerDraft, apiKey: "" });
      setNotice("AI provider saved locally.");
    } catch (error) {
      console.error(error);
      setNotice(error instanceof Error ? error.message : "Could not save AI provider.");
    }
  }

  async function askAssistant(event?: FormEvent) {
    event?.preventDefault();
    const prompt = assistantPrompt.trim();
    if (!prompt || assistantBusy) return;

    const threadId = activeAssistantThreadId || uid("thread");
    const threadTitle = assistantThreadTitle(prompt);
    const userMessage = makeAssistantMessage(prompt, "user");
    const fallback = makeLocalAssistantReply(prompt, data);
    setAssistantBusy(true);
    setAssistantPrompt("");
    setActiveAssistantThreadId(threadId);
    commitData((current) => upsertAssistantThread(current, threadId, threadTitle, [userMessage]));

    try {
      let draft = fallback;
      if (window.focusVaultAI && providerStatus?.hasApiKey) {
        const context = buildAssistantContext(data);
        const response = await window.focusVaultAI.chat({
          messages: [
            { role: "system", content: assistantSystemPrompt() },
            { role: "user", content: `App context:\n${JSON.stringify(context)}\n\nUser question:\n${prompt}` },
          ],
          responseFormat: { type: "json_object" },
        });
        draft = parseAiAssistantReply(response.content, fallback);
      }

      const assistantMessage = makeAssistantMessage(draft.content, "assistant", draft.links);
      commitData((current) =>
        appendActivity(
          upsertAssistantThread(current, threadId, threadTitle, [assistantMessage]),
          makeActivity("assistant_action", `Assistant answered: ${prompt.slice(0, 80)}`, { points: 1 }),
        ),
      );
    } catch (error) {
      console.error(error);
      const assistantMessage = makeAssistantMessage(
        `${fallback.content}\n\nAI provider note: ${error instanceof Error ? error.message : "Could not reach the provider."}`,
        "assistant",
        fallback.links,
      );
      commitData((current) => upsertAssistantThread(current, threadId, threadTitle, [assistantMessage]));
    } finally {
      setAssistantBusy(false);
    }
  }

  function startNewAssistantThread() {
    const now = todayIso();
    const thread: AssistantThread = {
      id: uid("thread"),
      title: "New chat",
      messages: [],
      archived: false,
      createdAt: now,
      updatedAt: now,
    };
    commitData((current) => ({ ...current, assistantThreads: [thread, ...current.assistantThreads] }));
    setActiveAssistantThreadId(thread.id);
    setAssistantPrompt("");
    setView("assistant");
  }

  function archiveAssistantThread(id: string) {
    commitData((current) => ({
      ...current,
      assistantThreads: current.assistantThreads.map((thread) =>
        thread.id === id ? { ...thread, archived: !thread.archived, updatedAt: todayIso() } : thread,
      ),
    }));
  }

  function followAssistantLink(link: AssistantLink) {
    const nextView = (link.target.view as ViewKey | undefined) ?? "today";
    setView(nextView);
    if (link.target.resourceId) setSelectedId(link.target.resourceId);
    if (link.target.courseId) {
      const firstResource = data.resources.find((item) => item.courseId === link.target.courseId);
      if (firstResource) setSelectedId(firstResource.id);
    }
  }

  function addChecklistItem() {
    if (!selected || !newCheckText.trim()) return;
    updateResource(selected.id, {
      checklist: [...selected.checklist, { id: uid("check"), text: newCheckText.trim(), done: false }],
    });
    setNewCheckText("");
  }

  function markRevised(item: Resource) {
    commitData((current) =>
      appendActivity(
        {
          ...current,
          resources: current.resources.map((resource) =>
            resource.id === item.id
              ? {
                  ...resource,
                  revisionCount: resource.revisionCount + 1,
                  nextReviewAt: dateInDays(Math.min(30, 3 + resource.revisionCount * 4)),
                  updatedAt: todayIso(),
                }
              : resource,
          ),
        },
        makeActivity("revised", `Revised ${item.title}`, {
          resourceId: item.id,
          courseId: item.courseId,
          category: "revision",
          points: 3,
        }),
      ),
    );
  }

  const isAssistantView = view === "assistant";
  const showCapture = captureViewKeys.includes(view);
  const showStats = statsViewKeys.includes(view);
  const showDetail = detailViewKeys.includes(view) && Boolean(visibleSelected);

  return (
    <div className={isAssistantView ? "app-shell assistant-mode" : "app-shell"}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <img src="/app-icon.png" alt="" />
          </div>
          <div>
            <strong>FocusVault</strong>
            <span>study memory system</span>
          </div>
        </div>

        <nav className="nav-list" aria-label="Primary">
          {viewSections.map((section) => (
            <div className="nav-group" key={section.title}>
              <span className="nav-group-label">{section.title}</span>
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.key}
                    className={view === item.key ? "nav-item active" : "nav-item"}
                    aria-label={item.label}
                    onClick={() => setView(item.key)}
                  >
                    <Icon size={17} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-panel">
          <p className="eyeline">This week</p>
          <div className="mini-stat">
            <span>{stats.avgProgress}%</span>
            <small>average progress</small>
          </div>
          <div className="mini-grid">
            <span>{stats.active} active</span>
            <span>{stats.review} due</span>
          </div>
          <button className="sidebar-tool danger" type="button" onClick={resetVault}>
            <Trash2 size={14} />
            Clear vault
          </button>
        </div>
      </aside>

      <main className={isAssistantView ? "workspace assistant-workspace" : "workspace"}>
        {isAssistantView ? (
          <AssistantView
            threads={data.assistantThreads}
            activeThreadId={activeAssistantThreadId}
            setActiveThreadId={setActiveAssistantThreadId}
            prompt={assistantPrompt}
            setPrompt={setAssistantPrompt}
            busy={assistantBusy}
            onAsk={askAssistant}
            onOpenLink={followAssistantLink}
            providerStatus={providerStatus}
            onOpenSettings={() => setAssistantSettingsOpen(true)}
            onNewThread={startNewAssistantThread}
            onArchiveThread={archiveAssistantThread}
            compact={false}
          />
        ) : (
          <>
            <header className="topbar">
              <div>
                <h1>{headingFor(view)}</h1>
                <p>{subheadingFor(view)}</p>
              </div>
              <div className="topbar-actions">
                <button
                  className="icon-button theme-toggle"
                  type="button"
                  title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                  aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                  onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
                >
                  {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
                </button>
                <button
                  className={notificationPermission === "granted" ? "icon-button active" : "icon-button"}
                  type="button"
                  title="Enable review notifications"
                  aria-label="Enable review notifications"
                  onClick={enableNotifications}
                >
                  <Bell size={18} />
                </button>
                <label className="icon-button" title="Add PDFs, slides, images, or files">
                  <Upload size={18} />
                  <input multiple type="file" onChange={(event) => handleFiles(event)} />
                </label>
                <button className="icon-button" type="button" title="Export backup" aria-label="Export backup" onClick={exportBackup}>
                  <Download size={18} />
                </button>
                <button
                  className="icon-button"
                  type="button"
                  title="Import backup"
                  aria-label="Import backup"
                  onClick={() => importInputRef.current?.click()}
                >
                  <Archive size={18} />
                </button>
                <input ref={importInputRef} className="sr-only" type="file" accept="application/json" onChange={importBackup} />
                <div className="search-box">
                  <Search size={17} />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search notes, links, tags" />
                </div>
              </div>
            </header>

            {showCapture && (
              <section className="capture-strip">
                <form className="capture-form" onSubmit={handleQuickCapture}>
                  <input
                    value={captureText}
                    onChange={(event) => setCaptureText(event.target.value)}
                    placeholder="Paste YouTube, article, paper, goal, or quick note"
                  />
                  <input
                    value={captureTitle}
                    onChange={(event) => setCaptureTitle(event.target.value)}
                    placeholder="Optional title"
                  />
                  <button type="submit">
                    <Plus size={17} />
                    Capture
                  </button>
                </form>
              </section>
            )}

            {showStats && (
              <section className="stats-row">
                <Stat icon={Archive} label="Collected" value={stats.total} />
                <Stat icon={Play} label="Active" value={stats.active} />
                <Stat icon={AlarmClock} label="Review due" value={stats.review} />
                <Stat icon={CheckCircle2} label="Completed" value={stats.done} />
              </section>
            )}

            <div className={showDetail ? "content-grid" : "content-grid single"}>
              <section className="main-column">
                {view === "courses" && (
                  <CourseBoard
                    courses={data.courses}
                    resources={data.resources}
                    onCreateCourse={createCourse}
                    courseTitle={courseTitle}
                    setCourseTitle={setCourseTitle}
                    onUpload={handleFiles}
                    onSelect={(id) => setSelectedId(id)}
                    onUpdateCourse={updateCourse}
                    onDeleteCourse={deleteCourse}
                  />
                )}

                {view === "insights" && <Insights data={data} />}

                {view === "progress" && (
                  <ProgressDashboard
                    data={data}
                    dailyDraft={dailyDraft}
                    setDailyDraft={setDailyDraft}
                    onSaveDailyLog={saveDailyLog}
                  />
                )}

                {view === "timeline" && <TimelineView data={data} onOpenLink={followAssistantLink} />}

                {view === "archive" && (
                  <ArchiveView resources={data.resources.filter((item) => item.status === "done")} courses={data.courses} onSelect={setSelectedId} />
                )}

                {view === "dump" && (
                  <LinkDump
                    resources={filteredResources}
                    courses={data.courses}
                    selectedId={selected?.id}
                    onSelect={setSelectedId}
                    onUpdate={updateResource}
                  />
                )}

                {!["dump", "courses", "insights", "progress", "timeline", "archive", "assistant"].includes(view) && (
                  <ResourceList
                    title={listTitleFor(view)}
                    resources={filteredResources}
                    courses={data.courses}
                    selectedId={selected?.id}
                    onSelect={setSelectedId}
                    onStatus={(id, status) => updateResource(id, { status })}
                  />
                )}
              </section>

              {showDetail && (
                <DetailPanel
                  resource={visibleSelected}
                  courses={data.courses}
                  onUpdate={updateResource}
                  onAddCheck={addChecklistItem}
                  newCheckText={newCheckText}
                  setNewCheckText={setNewCheckText}
                  onRevised={markRevised}
                  onDelete={deleteResource}
                  onOpen={openResource}
                />
              )}
            </div>
          </>
        )}
      </main>
      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
      {!isAssistantView && (
        <button className="assistant-fab" type="button" aria-label="Open assistant" onClick={() => setAssistantOverlayOpen(true)}>
          <Bot size={22} />
        </button>
      )}
      {assistantOverlayOpen && (
        <AssistantOverlay onClose={() => setAssistantOverlayOpen(false)}>
          <AssistantView
            threads={data.assistantThreads}
            activeThreadId={activeAssistantThreadId}
            setActiveThreadId={setActiveAssistantThreadId}
            prompt={assistantPrompt}
            setPrompt={setAssistantPrompt}
            busy={assistantBusy}
            onAsk={askAssistant}
            onOpenLink={(link) => {
              followAssistantLink(link);
              setAssistantOverlayOpen(false);
            }}
            providerStatus={providerStatus}
            onOpenSettings={() => setAssistantSettingsOpen(true)}
            onNewThread={startNewAssistantThread}
            onArchiveThread={archiveAssistantThread}
            compact
          />
        </AssistantOverlay>
      )}
      {assistantSettingsOpen && (
        <ProviderSettingsModal
          providerDraft={providerDraft}
          setProviderDraft={setProviderDraft}
          providerStatus={providerStatus}
          onSaveProvider={saveProviderSettings}
          onClose={() => setAssistantSettingsOpen(false)}
        />
      )}
    </div>
  );
}

function LinkDump({
  resources,
  courses,
  selectedId,
  onSelect,
  onUpdate,
}: {
  resources: Resource[];
  courses: Course[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Resource>) => void;
}) {
  const waiting = resources.filter((item) => item.status === "inbox" || item.status === "queued");
  const active = resources.filter((item) => item.status === "active");
  const saved = resources.filter((item) => item.status === "paused" || item.status === "done");

  return (
    <div className="dump-area">
      <div className="dump-intro">
        <div>
          <h2>Knowledge dump</h2>
          <p>Save now, understand later. This is for random videos, playlists, articles, papers, ideas, tools, and future study paths.</p>
        </div>
        <div className="dump-metrics">
          <span>{waiting.length} waiting</span>
          <span>{active.length} studying</span>
          <span>{saved.length} parked</span>
        </div>
      </div>

      <div className="dump-lanes">
        <DumpLane
          title="Saved for later"
          hint="Fresh captures you do not want to forget."
          resources={waiting}
          courses={courses}
          selectedId={selectedId}
          onSelect={onSelect}
          onUpdate={onUpdate}
        />
        <DumpLane
          title="Studying now"
          hint="Promoted items you want to actively work through."
          resources={active}
          courses={courses}
          selectedId={selectedId}
          onSelect={onSelect}
          onUpdate={onUpdate}
        />
        <DumpLane
          title="Parked or done"
          hint="Finished, paused, or archived knowledge items."
          resources={saved}
          courses={courses}
          selectedId={selectedId}
          onSelect={onSelect}
          onUpdate={onUpdate}
        />
      </div>
    </div>
  );
}

function DumpLane({
  title,
  hint,
  resources,
  courses,
  selectedId,
  onSelect,
  onUpdate,
}: {
  title: string;
  hint: string;
  resources: Resource[];
  courses: Course[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Resource>) => void;
}) {
  return (
    <section className="dump-lane">
      <div className="dump-lane-head">
        <div>
          <h3>{title}</h3>
          <p>{hint}</p>
        </div>
        <span>{resources.length}</span>
      </div>
      <div className="dump-list">
        {resources.map((item) => {
          const course = courses.find((entry) => entry.id === item.courseId);
          return (
            <article
              key={item.id}
              className={selectedId === item.id ? "dump-card selected" : "dump-card"}
              onClick={() => onSelect(item.id)}
            >
              <Thumbnail item={item} />
              <div className="dump-card-body">
                <div className="resource-topline">
                  <span>{typeLabels[item.type]}</span>
                  {course && <span>{course.title}</span>}
                  {item.status === "active" && <span className="studying">Studying</span>}
                </div>
                <h4>{item.title}</h4>
                <p>{item.notes || item.resumeLabel || item.sourceUrl || "Captured. Not organized yet."}</p>
                <div className="dump-actions">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onUpdate(item.id, { status: "active", group: item.group ?? "Knowledge dump" });
                    }}
                  >
                    Study
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onUpdate(item.id, { status: "queued", nextReviewAt: dateInDays(3), group: item.group ?? "Knowledge dump" });
                    }}
                  >
                    Review later
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onUpdate(item.id, { status: "done" });
                    }}
                  >
                    Done
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Archive; label: string; value: number }) {
  return (
    <div className="stat">
      <Icon size={18} />
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

function CourseBoard({
  courses,
  resources,
  onCreateCourse,
  courseTitle,
  setCourseTitle,
  onUpload,
  onSelect,
  onUpdateCourse,
  onDeleteCourse,
}: {
  courses: Course[];
  resources: Resource[];
  onCreateCourse: (event: FormEvent) => void;
  courseTitle: string;
  setCourseTitle: (value: string) => void;
  onUpload: (event: ChangeEvent<HTMLInputElement>, courseId?: string) => void;
  onSelect: (id: string) => void;
  onUpdateCourse: (id: string, patch: Partial<Course>) => void;
  onDeleteCourse: (id: string) => void;
}) {
  return (
    <div className="course-area">
      <form className="new-course" onSubmit={onCreateCourse}>
        <FolderPlus size={18} />
        <input value={courseTitle} onChange={(event) => setCourseTitle(event.target.value)} placeholder="Create course tile" />
        <button type="submit">Add course</button>
      </form>

      <div className="course-grid">
        {courses.map((course) => {
          const courseResources = resources.filter((item) => item.courseId === course.id);
          const avg = courseResources.length
            ? Math.round(courseResources.reduce((sum, item) => sum + item.progress, 0) / courseResources.length)
            : 0;
          return (
            <article className="course-tile" key={course.id} style={{ "--course": course.color } as React.CSSProperties}>
              <div className="course-head">
                <div>
                  <input
                    className="course-title-input"
                    value={course.title}
                    aria-label="Course title"
                    onChange={(event) => onUpdateCourse(course.id, { title: event.target.value })}
                  />
                  <input
                    className="course-input"
                    value={course.currentModule}
                    aria-label="Current module"
                    onChange={(event) => onUpdateCourse(course.id, { currentModule: event.target.value })}
                  />
                </div>
                <span>{avg}%</span>
              </div>
              <div className="progress-line">
                <span style={{ width: `${avg}%` }} />
              </div>
              <textarea
                className="course-goal-input"
                value={course.goal}
                aria-label="Course goal"
                onChange={(event) => onUpdateCourse(course.id, { goal: event.target.value })}
              />
              <div className="course-tools">
                <div className="color-swatches" aria-label="Course color">
                  {courseColors.map((color) => (
                    <button
                      key={color}
                      type="button"
                      aria-label={`Use course color ${color}`}
                      className={course.color === color ? "selected" : ""}
                      style={{ "--swatch": color } as React.CSSProperties}
                      onClick={() => onUpdateCourse(course.id, { color })}
                    />
                  ))}
                </div>
                <button className="ghost-danger" type="button" onClick={() => onDeleteCourse(course.id)}>
                  <Trash2 size={15} />
                  Delete
                </button>
              </div>
              <div className="course-meta">
                <span>{courseResources.length} materials</span>
                <span>Target {prettyDate(course.targetDate)}</span>
              </div>
              <label className="course-date-field">
                <span>Target date</span>
                <input
                  type="date"
                  value={dateInputValue(course.targetDate)}
                  onChange={(event) => onUpdateCourse(course.id, { targetDate: dateInputToIso(event.target.value) })}
                />
              </label>
              <label className="upload-inline">
                <Upload size={16} />
                Add PDFs, slides, images
                <input multiple type="file" onChange={(event) => onUpload(event, course.id)} />
              </label>
              <div className="course-resources">
                {courseResources.slice(0, 4).map((item) => (
                  <button key={item.id} onClick={() => onSelect(item.id)}>
                    <ResourceIcon item={item} />
                    <span>{item.title}</span>
                    <ChevronRight size={15} />
                  </button>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function ResourceList({
  title,
  resources,
  courses,
  selectedId,
  onSelect,
  onStatus,
}: {
  title: string;
  resources: Resource[];
  courses: Course[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onStatus: (id: string, status: ResourceStatus) => void;
}) {
  return (
    <div>
      <div className="section-title">
        <h2>{title}</h2>
        <span>{resources.length} items</span>
      </div>
      <div className="resource-list">
        {resources.map((item) => {
          const course = courses.find((entry) => entry.id === item.courseId);
          return (
            <article
              key={item.id}
              className={selectedId === item.id ? "resource-card selected" : "resource-card"}
              onClick={() => onSelect(item.id)}
            >
              <Thumbnail item={item} />
              <div className="resource-body">
                <div className="resource-topline">
                  <span>{typeLabels[item.type]}</span>
                  {course && <span>{course.title}</span>}
                  {isDue(item.nextReviewAt) && <span className="due">Review due</span>}
                </div>
                <h3>{item.title}</h3>
                <p>{item.notes || item.resumeLabel || "No notes yet"}</p>
                <div className="resource-footer">
                  <div className="progress-line compact">
                    <span style={{ width: `${item.progress}%` }} />
                  </div>
                  <span>{item.progress}%</span>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      onStatus(item.id, item.status === "done" ? "active" : "done");
                    }}
                  >
                    {item.status === "done" ? "Reopen" : "Done"}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function DetailPanel({
  resource,
  courses,
  onUpdate,
  onAddCheck,
  newCheckText,
  setNewCheckText,
  onRevised,
  onDelete,
  onOpen,
}: {
  resource?: Resource;
  courses: Course[];
  onUpdate: (id: string, patch: Partial<Resource>) => void;
  onAddCheck: () => void;
  newCheckText: string;
  setNewCheckText: (value: string) => void;
  onRevised: (resource: Resource) => void;
  onDelete: (id: string) => void;
  onOpen: (resource: Resource) => void;
}) {
  const [tagText, setTagText] = useState("");

  useEffect(() => {
    setTagText(resource?.tags.join(", ") ?? "");
  }, [resource?.id, resource?.tags]);

  if (!resource) {
    return (
      <aside className="detail-panel empty">
        <NotebookPen size={32} />
        <h2>Select an item</h2>
        <p>Your notes, progress, resume point, and checklist will live here.</p>
      </aside>
    );
  }

  return (
    <aside className="detail-panel">
      <div className="detail-hero">
        <Thumbnail item={resource} large />
        <div>
          <span>{typeLabels[resource.type]}</span>
          <input
            className="detail-title-input"
            value={resource.title}
            aria-label="Resource title"
            onChange={(event) => onUpdate(resource.id, { title: event.target.value })}
          />
        </div>
      </div>

      <div className="field-row two">
        <ThemedSelect
          label="Type"
          value={resource.type}
          options={Object.entries(typeLabels).map(([value, label]) => ({ value, label }))}
          onChange={(value) => onUpdate(resource.id, { type: value as ResourceType })}
        />
        <ThemedSelect
          label="Status"
          value={resource.status}
          options={Object.entries(statusLabels).map(([value, label]) => ({ value, label }))}
          onChange={(value) => onUpdate(resource.id, { status: value as ResourceStatus })}
        />
      </div>

      <div className="field-row two">
        <ThemedSelect
          label="Course"
          value={resource.courseId ?? ""}
          options={[{ value: "", label: "No course" }, ...courses.map((course) => ({ value: course.id, label: course.title }))]}
          onChange={(value) => onUpdate(resource.id, { courseId: value || undefined })}
        />
        <label className="field">
          Group
          <input
            value={resource.group ?? ""}
            onChange={(event) => onUpdate(resource.id, { group: event.target.value || undefined })}
            placeholder="Week 2, Project ideas, Life OS"
          />
        </label>
      </div>

      <label className="field">
        Tags
        <input
          value={tagText}
          onChange={(event) => setTagText(event.target.value)}
          onBlur={() => onUpdate(resource.id, { tags: splitTags(tagText) })}
          placeholder="lecture, paper, exam"
        />
      </label>

      <label className="field">
        Progress: {resource.progress}%
        <input
          type="range"
          min="0"
          max="100"
          value={resource.progress}
          onChange={(event) => onUpdate(resource.id, { progress: Number(event.target.value) })}
        />
      </label>

      <label className="field">
        Resume where left
        <input
          value={resource.resumeLabel ?? ""}
          onChange={(event) => onUpdate(resource.id, { resumeLabel: event.target.value })}
          placeholder="Page 12, Slide 31, 18:42, Chapter 4"
        />
      </label>

      <label className="field">
        Next review date
        <input
          type="date"
          value={dateInputValue(resource.nextReviewAt)}
          onChange={(event) => onUpdate(resource.id, { nextReviewAt: dateInputToIso(event.target.value) })}
        />
      </label>

      <label className="field">
        Notes
        <textarea
          value={resource.notes}
          onChange={(event) => onUpdate(resource.id, { notes: event.target.value })}
          placeholder="Key ideas, doubts, summary, next step..."
        />
      </label>

      <div className="checklist">
        <div className="panel-heading">
          <h3>Checklist</h3>
          <ListChecks size={17} />
        </div>
        {resource.checklist.map((check) => (
          <label key={check.id} className="check-row">
            <input
              type="checkbox"
              checked={check.done}
              onChange={() =>
                onUpdate(resource.id, {
                  checklist: resource.checklist.map((item) => (item.id === check.id ? { ...item, done: !item.done } : item)),
                })
              }
            />
            <span>{check.text}</span>
          </label>
        ))}
        <div className="add-check">
          <input value={newCheckText} onChange={(event) => setNewCheckText(event.target.value)} placeholder="Add checklist step" />
          <button onClick={onAddCheck} type="button">
            <Plus size={16} />
          </button>
        </div>
      </div>

      <div className="review-box">
        <div>
          <span>Revisions</span>
          <strong>{resource.revisionCount}</strong>
        </div>
        <div>
          <span>Next review</span>
          <strong>{prettyDate(resource.nextReviewAt)}</strong>
        </div>
        <button onClick={() => onRevised(resource)}>
          <Check size={16} />
          Revised today
        </button>
      </div>

      {resource.sourceUrl && (
        <a className="open-link" href={resource.sourceUrl} target="_blank" rel="noreferrer">
          <Link2 size={16} />
          Open source
        </a>
      )}

      {resource.fileMeta && (
        <div className="file-note">
          <FileText size={16} />
          {resource.fileMeta.name} - {formatFileSize(resource.fileMeta.size)}
        </div>
      )}

      <div className="detail-actions">
        {(resource.sourceUrl || resource.fileMeta?.id) && (
          <button className="secondary-action" type="button" onClick={() => onOpen(resource)}>
            <ExternalLink size={16} />
            Open
          </button>
        )}
        <button className="danger-action" type="button" onClick={() => onDelete(resource.id)}>
          <Trash2 size={16} />
          Delete
        </button>
      </div>
    </aside>
  );
}

function ThemedSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value) ?? options[0];

  return (
    <div className="select-field">
      <span className="select-label">{label}</span>
      <div
        className={open ? "custom-select open" : "custom-select"}
        onBlur={(event) => {
          const nextTarget = event.relatedTarget;
          if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
          setOpen(false);
        }}
      >
        <button
          type="button"
          className="select-trigger"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          <span>{selected?.label}</span>
          <ChevronDown size={16} />
        </button>
        {open && (
          <div className="select-popover" role="listbox" aria-label={label}>
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === value}
                className={option.value === value ? "select-option selected" : "select-option"}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProgressDashboard({
  data,
  dailyDraft,
  setDailyDraft,
  onSaveDailyLog,
}: {
  data: AppData;
  dailyDraft: DailyLog;
  setDailyDraft: (log: DailyLog) => void;
  onSaveDailyLog: (event: FormEvent) => void;
}) {
  const grouped = eventsByDate(data.activityLog);
  const days = lastNDays(98);
  const streak = currentStreak(data.activityLog);
  const totalPoints = activityPoints(data.activityLog);
  const weekPoints = lastNDays(7).reduce((sum, key) => sum + activityPoints(grouped[key] ?? []), 0);

  return (
    <div className="progress-area">
      <div className="section-title">
        <h2>Daily progress</h2>
        <span>{streak} day streak</span>
      </div>
      <div className="analysis-grid">
        <div className="analysis-block">
          <h3>Contribution grid</h3>
          <div className="contribution-grid" aria-label="Daily activity contribution grid">
            {days.map((day) => {
              const points = activityPoints(grouped[day] ?? []);
              return <span key={day} className={`heat-${contributionLevel(points)}`} title={`${day}: ${points} points`} />;
            })}
          </div>
          <div className="progress-kpis">
            <span>{totalPoints} total points</span>
            <span>{weekPoints} this week</span>
            <span>{data.activityLog.length} events</span>
          </div>
        </div>

        <form className="analysis-block daily-log-form" onSubmit={onSaveDailyLog}>
          <h3>Today log</h3>
          <div className="daily-grid">
            <NumberField label="Study minutes" value={dailyDraft.studyMinutes} onChange={(studyMinutes) => setDailyDraft({ ...dailyDraft, studyMinutes })} />
            <NumberField label="Coding problems" value={dailyDraft.codingProblems} onChange={(codingProblems) => setDailyDraft({ ...dailyDraft, codingProblems })} />
            <NumberField label="Pages read" value={dailyDraft.pagesRead} onChange={(pagesRead) => setDailyDraft({ ...dailyDraft, pagesRead })} />
            <NumberField label="Videos done" value={dailyDraft.videosCompleted} onChange={(videosCompleted) => setDailyDraft({ ...dailyDraft, videosCompleted })} />
            <NumberField label="Revisions" value={dailyDraft.revisionsDone} onChange={(revisionsDone) => setDailyDraft({ ...dailyDraft, revisionsDone })} />
          </div>
          <label className="field">
            Reflection
            <textarea
              value={dailyDraft.reflection}
              onChange={(event) => setDailyDraft({ ...dailyDraft, reflection: event.target.value })}
              placeholder="What did you learn or finish today?"
            />
          </label>
          <button type="submit" className="primary-wide">
            <Check size={16} />
            Save daily log
          </button>
        </form>
      </div>
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="field compact-field">
      {label}
      <input min="0" type="number" value={value} onChange={(event) => onChange(Math.max(0, Number(event.target.value)))} />
    </label>
  );
}

function TimelineView({ data, onOpenLink }: { data: AppData; onOpenLink: (link: AssistantLink) => void }) {
  const events = [...data.activityLog].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <div>
      <div className="section-title">
        <h2>Timeline</h2>
        <span>{events.length} events</span>
      </div>
      <div className="timeline-list">
        {events.length === 0 && <EmptyBlock title="No activity yet" text="Capture, upload, revise, finish, or log study to build your timeline." />}
        {events.map((event) => (
          <article className="timeline-card" key={event.id}>
            <span className="timeline-dot" />
            <div>
              <div className="resource-topline">
                <span>{event.category}</span>
                <span>{prettyDate(event.createdAt)}</span>
                <span>{event.points} pts</span>
              </div>
              <h3>{event.title}</h3>
              {event.minutes && <p>{event.minutes} minutes logged</p>}
              {(event.resourceId || event.courseId) && (
                <button
                  className="secondary-action"
                  type="button"
                  onClick={() => onOpenLink({ label: event.title, target: { view: event.resourceId ? "library" : "courses", resourceId: event.resourceId, courseId: event.courseId } })}
                >
                  <ExternalLink size={15} />
                  Open related
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function ArchiveView({ resources, courses, onSelect }: { resources: Resource[]; courses: Course[]; onSelect: (id: string) => void }) {
  return (
    <div>
      <div className="section-title">
        <h2>Archive shelf</h2>
        <span>{resources.length} finished</span>
      </div>
      <div className="archive-grid">
        {resources.length === 0 && <EmptyBlock title="No finished items yet" text="Completed resources will collect here so you can see what you have already done." />}
        {resources.map((item) => {
          const course = courses.find((entry) => entry.id === item.courseId);
          return (
            <article className="archive-card" key={item.id} onClick={() => onSelect(item.id)}>
              <Thumbnail item={item} />
              <div>
                <div className="resource-topline">
                  <span>{typeLabels[item.type]}</span>
                  {course && <span>{course.title}</span>}
                </div>
                <h3>{item.title}</h3>
                <p>{item.notes || item.resumeLabel || "Finished and archived."}</p>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function AssistantView({
  threads,
  activeThreadId,
  setActiveThreadId,
  prompt,
  setPrompt,
  busy,
  onAsk,
  onOpenLink,
  providerStatus,
  onOpenSettings,
  onNewThread,
  onArchiveThread,
  compact,
}: {
  threads: AssistantThread[];
  activeThreadId: string;
  setActiveThreadId: (id: string) => void;
  prompt: string;
  setPrompt: (value: string) => void;
  busy: boolean;
  onAsk: (event?: FormEvent) => void;
  onOpenLink: (link: AssistantLink) => void;
  providerStatus: AIProviderSettings | null;
  onOpenSettings: () => void;
  onNewThread: () => void;
  onArchiveThread: (id: string) => void;
  compact: boolean;
}) {
  const quickPrompts = ["What should I do next?", "What is pending?", "What did I finish this week?", "Show my activity progress"];
  const activeThread = threads.find((thread) => thread.id === activeThreadId) ?? threads.find((thread) => !thread.archived) ?? threads[0];
  const openThreads = threads.filter((thread) => !thread.archived);
  const archivedThreads = threads.filter((thread) => thread.archived);

  return (
    <div className={compact ? "assistant-shell compact" : "assistant-shell"}>
      <aside className="assistant-rail">
        <button className="new-chat-button" type="button" onClick={onNewThread}>
          <Plus size={16} />
          New chat
        </button>
        <div className="assistant-thread-section">
          <span>Chats</span>
          {openThreads.length === 0 && <p>No chats yet</p>}
          {openThreads.map((thread) => (
            <ThreadButton
              key={thread.id}
              thread={thread}
              active={thread.id === activeThread?.id}
              onSelect={() => setActiveThreadId(thread.id)}
              onArchive={() => onArchiveThread(thread.id)}
            />
          ))}
        </div>
        <div className="assistant-thread-section">
          <span>Archive</span>
          {archivedThreads.length === 0 && <p>No archived chats</p>}
          {archivedThreads.map((thread) => (
            <ThreadButton
              key={thread.id}
              thread={thread}
              active={thread.id === activeThread?.id}
              onSelect={() => setActiveThreadId(thread.id)}
              onArchive={() => onArchiveThread(thread.id)}
              archived
            />
          ))}
        </div>
      </aside>

      <section className="assistant-main">
        <header className="assistant-header">
          <div>
            <h2>{activeThread?.title ?? "Helper bot"}</h2>
            <span>{providerStatus?.hasApiKey ? `${providerStatus.name} connected` : "local intelligence"}</span>
          </div>
          <button className="assistant-settings-button" type="button" onClick={onOpenSettings}>
            <Settings size={16} />
            Provider
          </button>
        </header>

        <div className="assistant-scroll">
          {!activeThread?.messages.length && (
            <div className="assistant-empty">
              <Bot size={34} />
              <h3>How can I help your vault?</h3>
              <p>Ask what is pending, what to do next, what you finished, or which part of your work is getting stale.</p>
              <div className="quick-prompts">
                {quickPrompts.map((item) => (
                  <button key={item} type="button" onClick={() => setPrompt(item)}>
                    {item}
                  </button>
                ))}
              </div>
            </div>
          )}
          {activeThread?.messages.map((message) => (
            <article className={`chat-row ${message.role}`} key={message.id}>
              <div className="chat-avatar">{message.role === "assistant" ? <Bot size={16} /> : "You"}</div>
              <div className="chat-bubble">
                <p>{message.content}</p>
                {Boolean(message.links?.length) && (
                  <div className="assistant-links">
                    {message.links?.map((link, index) => (
                      <button key={`${message.id}-${index}`} type="button" onClick={() => onOpenLink(link)}>
                        <ExternalLink size={14} />
                        {link.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>

        <form className="chat-composer" onSubmit={onAsk}>
          <input value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Message FocusVault..." />
          <button type="submit" disabled={busy}>
            <Send size={16} />
          </button>
        </form>
      </section>
    </div>
  );
}

function ThreadButton({
  thread,
  active,
  archived = false,
  onSelect,
  onArchive,
}: {
  thread: AssistantThread;
  active: boolean;
  archived?: boolean;
  onSelect: () => void;
  onArchive: () => void;
}) {
  return (
    <div className={active ? "thread-button active" : "thread-button"}>
      <button type="button" onClick={onSelect}>
        <MessageSquare size={15} />
        <span>{thread.title}</span>
      </button>
      <button type="button" title={archived ? "Unarchive chat" : "Archive chat"} onClick={onArchive}>
        <Archive size={14} />
      </button>
    </div>
  );
}

function AssistantOverlay({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="assistant-overlay">
      <div className="assistant-overlay-panel">
        <button className="overlay-close" type="button" aria-label="Close assistant" onClick={onClose}>
          <X size={18} />
        </button>
        {children}
      </div>
    </div>
  );
}

function ProviderSettingsModal({
  providerDraft,
  setProviderDraft,
  providerStatus,
  onSaveProvider,
  onClose,
}: {
  providerDraft: Omit<AIProviderSettings, "hasApiKey"> & { apiKey?: string };
  setProviderDraft: (settings: Omit<AIProviderSettings, "hasApiKey"> & { apiKey?: string }) => void;
  providerStatus: AIProviderSettings | null;
  onSaveProvider: (event: FormEvent) => void;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop">
      <form className="provider-modal" onSubmit={onSaveProvider}>
        <div className="modal-head">
          <div>
            <h2>AI provider</h2>
            <p>{providerStatus?.hasApiKey ? `${providerStatus.name} key saved locally` : "Add a key to use cloud intelligence."}</p>
          </div>
          <button type="button" className="overlay-close inline" onClick={onClose} aria-label="Close provider settings">
            <X size={18} />
          </button>
        </div>
        <ThemedSelect
          label="Provider"
          value={providerDraft.provider}
          options={[
            { value: "deepseek", label: "DeepSeek" },
            { value: "openai", label: "OpenAI compatible" },
            { value: "custom", label: "Custom compatible" },
            { value: "anthropic", label: "Claude slot" },
            { value: "gemini", label: "Gemini slot" },
          ]}
          onChange={(value) => setProviderDraft({ ...providerDraft, provider: value as AIProviderSettings["provider"] })}
        />
        <label className="field">
          Name
          <input value={providerDraft.name} onChange={(event) => setProviderDraft({ ...providerDraft, name: event.target.value })} />
        </label>
        <label className="field">
          Base URL
          <input value={providerDraft.baseUrl} onChange={(event) => setProviderDraft({ ...providerDraft, baseUrl: event.target.value })} />
        </label>
        <label className="field">
          Model
          <input value={providerDraft.model} onChange={(event) => setProviderDraft({ ...providerDraft, model: event.target.value })} />
        </label>
        <label className="field">
          API key
          <input
            value={providerDraft.apiKey ?? ""}
            onChange={(event) => setProviderDraft({ ...providerDraft, apiKey: event.target.value })}
            placeholder={providerStatus?.hasApiKey ? "Saved. Paste a new key to replace." : "Paste API key"}
            type="password"
          />
        </label>
        <button className="primary-wide" type="submit">
          <Check size={16} />
          Save provider
        </button>
        <p className="muted">DeepSeek, OpenAI, and Custom use OpenAI-compatible chat completions. Claude/Gemini slots are kept for later adapter support.</p>
      </form>
    </div>
  );
}

function EmptyBlock({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-block">
      <NotebookPen size={24} />
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

function Insights({ data }: { data: AppData }) {
  const byType = Object.entries(
    data.resources.reduce<Record<string, number>>((acc, item) => {
      acc[item.type] = (acc[item.type] ?? 0) + 1;
      return acc;
    }, {}),
  );
  const active = data.resources.filter((item) => item.status === "active");
  const doneChecklist = data.resources.flatMap((item) => item.checklist).filter((item) => item.done).length;
  const allChecklist = data.resources.flatMap((item) => item.checklist).length || 1;

  return (
    <div className="insights">
      <div className="section-title">
        <h2>Tracking analysis</h2>
        <span>Local overview</span>
      </div>
      <div className="analysis-grid">
        <div className="analysis-block">
          <h3>Material mix</h3>
          {byType.map(([type, count]) => (
            <div className="bar-row" key={type}>
              <span>{typeLabels[type as ResourceType] ?? type}</span>
              <div>
                <i style={{ width: `${Math.min(100, count * 18)}%` }} />
              </div>
              <strong>{count}</strong>
            </div>
          ))}
        </div>
        <div className="analysis-block">
          <h3>Momentum</h3>
          <p className="big-number">{active.length}</p>
          <span>active focus items</span>
          <p className="muted">{Math.round((doneChecklist / allChecklist) * 100)}% checklist completion across saved materials.</p>
        </div>
      </div>
    </div>
  );
}

function Thumbnail({ item, large = false }: { item: Resource; large?: boolean }) {
  const isImage = item.thumbnail?.startsWith("data:") || item.thumbnail?.startsWith("http");
  return (
    <div className={large ? "thumbnail large" : "thumbnail"}>
      {isImage ? <img src={item.thumbnail} alt="" /> : <ResourceIcon item={item} />}
    </div>
  );
}

function ResourceIcon({ item }: { item: Resource }) {
  if (item.thumbnail === "google-drive") return <FolderPlus size={18} />;
  if (item.type === "image") return <Image size={18} />;
  if (item.type === "pdf" || item.type === "paper") return <FileText size={18} />;
  if (item.type === "slides") return <FileImage size={18} />;
  if (item.type === "goal") return <Goal size={18} />;
  if (item.type === "video" || item.type === "playlist") return <Play size={18} />;
  if (item.status === "paused") return <Pause size={18} />;
  return <BookOpen size={18} />;
}

function splitTags(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function dateInputValue(value?: string) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

function dateInputToIso(value: string) {
  return value ? new Date(`${value}T09:00:00`).toISOString() : undefined;
}

function makeImageThumbnail(file: File): Promise<string> {
  return new Promise((resolve) => {
    if (!file.type.startsWith("image/")) {
      resolve("image");
      return;
    }

    const image = document.createElement("img");
    const url = URL.createObjectURL(file);
    image.onload = () => {
      const maxEdge = 480;
      const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext("2d");
      context?.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.78));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve("image");
    };
    image.src = url;
  });
}

function emptyDailyLog(date = dateKey()): DailyLog {
  const now = todayIso();
  return {
    id: uid("day"),
    date,
    studyMinutes: 0,
    codingProblems: 0,
    pagesRead: 0,
    videosCompleted: 0,
    revisionsDone: 0,
    reflection: "",
    createdAt: now,
    updatedAt: now,
  };
}

function assistantThreadTitle(prompt: string) {
  const title = prompt.trim().replace(/\s+/g, " ");
  return title.length > 44 ? `${title.slice(0, 44)}...` : title || "New chat";
}

function upsertAssistantThread(data: AppData, id: string, title: string, messages: ReturnType<typeof makeAssistantMessage>[]): AppData {
  const now = todayIso();
  const existing = data.assistantThreads.find((thread) => thread.id === id);
  if (!existing) {
    return {
      ...data,
      assistantThreads: [
        {
          id,
          title,
          messages,
          archived: false,
          createdAt: now,
          updatedAt: now,
        },
        ...data.assistantThreads,
      ],
    };
  }

  return {
    ...data,
    assistantThreads: data.assistantThreads.map((thread) =>
      thread.id === id
        ? {
            ...thread,
            title: thread.title === "New chat" ? title : thread.title,
            messages: [...thread.messages, ...messages],
            updatedAt: now,
            archived: false,
          }
        : thread,
    ),
  };
}

function pointsFor(type: ActivityType) {
  const points: Record<ActivityType, number> = {
    captured: 1,
    uploaded: 2,
    created_course: 3,
    updated_progress: 1,
    completed: 4,
    revised: 3,
    archived: 4,
    unarchived: 1,
    logged_study: 2,
    logged_coding: 2,
    assistant_action: 1,
  };
  return points[type];
}

function categoryForResource(item?: Resource): ActivityCategory {
  if (!item) return "general";
  if (item.courseId) return "course";
  if (item.type === "paper" || item.type === "article" || item.type === "pdf") return "reading";
  if (item.type === "goal" || item.type === "task") return "goal";
  return "general";
}

function fileType(file: File): ResourceType {
  const name = file.name.toLowerCase();
  if (file.type.startsWith("image/")) return "image";
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".ppt") || name.endsWith(".pptx") || name.endsWith(".key")) return "slides";
  return "file";
}

function isDue(value?: string) {
  if (!value) return false;
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return new Date(value).getTime() <= today.getTime();
}

function isDumpItem(item: Resource) {
  if (item.courseId) return false;
  if (item.group === "Knowledge dump") return true;
  return ["video", "playlist", "article", "paper", "note"].includes(item.type);
}

function headingFor(view: ViewKey) {
  const labels: Record<ViewKey, string> = {
    today: "Today focus",
    dump: "Knowledge dump",
    inbox: "Capture inbox",
    courses: "Coursework tiles",
    library: "Knowledge library",
    goals: "Goals and plans",
    review: "Revision queue",
    progress: "Daily logger",
    timeline: "Activity timeline",
    archive: "Archive shelf",
    assistant: "Helper bot",
    insights: "Tracking analysis",
  };
  return labels[view];
}

function subheadingFor(view: ViewKey) {
  const labels: Record<ViewKey, string> = {
    today: "Resume what matters, revise what is due, and keep one clear lane.",
    dump: "Throw links and ideas here instantly so your future self can sort them without losing the trail.",
    inbox: "Drop links, PDFs, slides, images, ideas, papers, and tasks here first.",
    courses: "Group study materials by course, module, progress, and next review.",
    library: "Everything you collected, searchable and ready to arrange.",
    goals: "Plans, projects, and future work with notes and checklists.",
    review: "Items that need a second pass before they fade away.",
    progress: "Log your study, coding, revision, and momentum like a contribution graph.",
    timeline: "A chronological history of captures, uploads, revisions, completions, and assistant actions.",
    archive: "Your finished work stays visible here so progress feels real.",
    assistant: "Ask what is pending, what to do next, and jump directly to the right item.",
    insights: "A quick picture of what you are collecting and finishing.",
  };
  return labels[view];
}

function listTitleFor(view: ViewKey) {
  const labels: Record<ViewKey, string> = {
    today: "Focus queue",
    dump: "Knowledge dump",
    inbox: "Unsorted captures",
    courses: "Course materials",
    library: "All saved materials",
    goals: "Plans and tasks",
    review: "Due for revision",
    progress: "Daily progress",
    timeline: "Timeline",
    archive: "Archive",
    assistant: "Assistant",
    insights: "All items",
  };
  return labels[view];
}
