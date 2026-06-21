import client from "./client";

export interface ConversationSummary {
  id: number;
  title: string | null;
  updatedAt: string;
}

export interface MessageRecord {
  id: number;
  role: "user" | "assistant";
  content: string;
  modelName: string | null;
  createdAt: string;
}

export interface ConversationDetail extends ConversationSummary {
  messages: MessageRecord[];
}

export const conversationsApi = {
  list: () => client.get<{ conversations: ConversationSummary[] }>("/conversations"),
  get: (id: number) => client.get<{ conversation: ConversationDetail }>(`/conversations/${id}`),
  delete: (id: number) => client.delete<{ ok: boolean }>(`/conversations/${id}`),
};
