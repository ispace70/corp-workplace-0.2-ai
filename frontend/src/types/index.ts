export type RouteMode = "auto" | "knowledge" | "sql";
export type RouteLabel = "knowledge" | "sql" | "general";

export interface Source {
  source: string;
  page: string | number;
  content: string;
}

export interface SqlResult {
  success: boolean;
  columns: string[];
  rows: (string | number | null)[][];
  row_count: number;
  error?: string;
}

export type MessageRole = "user" | "assistant";

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  route?: RouteLabel;
  sources?: Source[];
  sqlReview?: string;          // SQL waiting for user review
  sqlResult?: SqlResult;
  isStreaming?: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
}
