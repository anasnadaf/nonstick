export interface Notebook {
  id: string;
  title: string;
  emoji: string;
  source_count: number;
  created_at: string;
  updated_at: string;
}

export interface Source {
  id: string;
  filename: string;
  mime: string;
  size_bytes: number;
  status: "processing" | "ready" | "failed";
  error: string | null;
  chunk_count: number;
  created_at: string;
}

export interface Citation {
  ref: number;
  kind: "document" | "web";
  chunk_id?: string;
  source_id?: string;
  filename?: string;
  url?: string;
  page?: number | null;
  snippet?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[];
  created_at: string;
}

export interface SessionInfo {
  id: string;
  title: string;
  created_at: string;
}

export interface Note {
  id: string;
  title: string;
  content_md: string;
  kind: "manual" | "summary" | "study_guide" | "faq";
  created_at: string;
  updated_at: string;
}

export interface Me {
  id: string;
  username: string;
  auth_enabled: boolean;
}

export interface ToolActivity {
  tool: string;
  running: boolean;
}
