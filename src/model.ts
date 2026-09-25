// Per-side snapshots. The merged canonical model arrives with the sync engine (milestone 3).

export type OFTaskStatus = "active" | "completed" | "dropped";
export type OFProjectStatus = "active" | "onHold" | "done" | "dropped";

export interface OFTask {
  id: string;
  name: string;
  note: string;
  status: OFTaskStatus;
  flagged: boolean;
  dueDate: string | null;
  deferDate: string | null;
  completedAt: string | null;
  estimatedMinutes: number | null;
  /** Full tag paths, e.g. "Mac : Online". */
  tags: string[];
  projectId: string | null;
  parentTaskId: string | null;
  inInbox: boolean;
  repeatRule: string | null;
  modifiedAt: string | null;
}

export interface OFProject {
  id: string;
  name: string;
  note: string;
  status: OFProjectStatus;
  folderPath: string[];
  deferDate: string | null;
  dueDate: string | null;
  completedAt: string | null;
  modifiedAt: string | null;
}

export interface OFSnapshot {
  exportedAt: string;
  projects: OFProject[];
  tasks: OFTask[];
}

export interface NotionTaskRow {
  pageId: string;
  url: string;
  title: string;
  status: string | null;
  priority: string | null;
  dueDate: string | null;
  deferDate: string | null;
  notes: string;
  flagged: boolean | null;
  tags: string[];
  projectPageIds: string[];
  ofId: string | null;
  lastEditedAt: string;
  inTrash: boolean;
}

export interface NotionProjectRow {
  pageId: string;
  url: string;
  title: string;
  status: string | null;
  startDate: string | null;
  endDate: string | null;
  ofId: string | null;
  lastEditedAt: string;
  inTrash: boolean;
}

/** Property name → type (plus option names for select/status). */
export type NotionSchema = Record<string, { type: string; options?: string[] }>;

export interface NotionSnapshot {
  exportedAt: string;
  tasks: NotionTaskRow[];
  projects: NotionProjectRow[];
  tasksSchema: NotionSchema;
  projectsSchema: NotionSchema;
}
