export type ResourceType =
  | "video"
  | "playlist"
  | "article"
  | "paper"
  | "pdf"
  | "slides"
  | "image"
  | "task"
  | "goal"
  | "note"
  | "file";

export type ResourceStatus = "inbox" | "queued" | "active" | "paused" | "done";

export type ChecklistItem = {
  id: string;
  text: string;
  done: boolean;
};

export type Resource = {
  id: string;
  title: string;
  type: ResourceType;
  status: ResourceStatus;
  sourceUrl?: string;
  thumbnail?: string;
  courseId?: string;
  group?: string;
  tags: string[];
  notes: string;
  checklist: ChecklistItem[];
  progress: number;
  resumeLabel?: string;
  revisionCount: number;
  nextReviewAt?: string;
  createdAt: string;
  updatedAt: string;
  fileMeta?: {
    id?: string;
    name: string;
    size: number;
    mime: string;
  };
};

export type Course = {
  id: string;
  title: string;
  color: string;
  goal: string;
  currentModule: string;
  targetDate?: string;
  createdAt: string;
  updatedAt?: string;
};

export type ActivityCategory = "course" | "coding" | "reading" | "revision" | "goal" | "general";

export type ActivityType =
  | "captured"
  | "uploaded"
  | "created_course"
  | "updated_progress"
  | "completed"
  | "revised"
  | "archived"
  | "unarchived"
  | "logged_study"
  | "logged_coding"
  | "assistant_action";

export type ActivityEvent = {
  id: string;
  type: ActivityType;
  title: string;
  resourceId?: string;
  courseId?: string;
  category: ActivityCategory;
  points: number;
  minutes?: number;
  createdAt: string;
};

export type DailyLog = {
  id: string;
  date: string;
  studyMinutes: number;
  codingProblems: number;
  pagesRead: number;
  videosCompleted: number;
  revisionsDone: number;
  reflection: string;
  createdAt: string;
  updatedAt: string;
};

export type AssistantTarget = {
  view?: string;
  resourceId?: string;
  courseId?: string;
  date?: string;
};

export type AssistantLink = {
  label: string;
  target: AssistantTarget;
};

export type AssistantMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  links?: AssistantLink[];
  createdAt: string;
};

export type AssistantThread = {
  id: string;
  title: string;
  messages: AssistantMessage[];
  archived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AssistantMemory = {
  userProfile: string;
  preferences: string[];
  activeGoals: string[];
  weakAreas: string[];
  longTermSummary: string;
  lastUpdatedAt?: string;
};

export type AIProviderSettings = {
  provider: "deepseek" | "openai" | "anthropic" | "gemini" | "custom";
  name: string;
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
};

export type AppData = {
  courses: Course[];
  resources: Resource[];
  activityLog: ActivityEvent[];
  dailyLogs: DailyLog[];
  assistantMemory: AssistantMemory;
  assistantMessages: AssistantMessage[];
  assistantThreads: AssistantThread[];
};

export type CapturePayload = {
  title?: string;
  url?: string;
  type?: ResourceType;
  thumbnail?: string;
};

export type BackupFile = {
  id: string;
  name: string;
  size: number;
  mime: string;
  createdAt: string;
  dataUrl: string;
};

export type AppBackup = {
  version: 1;
  exportedAt: string;
  data: AppData;
  files: BackupFile[];
};
