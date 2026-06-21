import client from "./client";

export interface ModelInfo {
  modelName: string;
  creditCost: number;
  installed: boolean;
}

export interface Credits {
  used: number;
  limit: number | null;
  isAdmin: boolean;
}

export const chatApi = {
  getModels: () => client.get<{ models: ModelInfo[] }>("/ollama/models"),
  getCredits: () => client.get<Credits>("/chat/credits"),
};

// Returns a fetch Response for SSE streaming (axios doesn't support streaming well)
export async function streamChat(
  params: { model: string; content: string; conversationId?: number | null },
  signal?: AbortSignal
): Promise<Response> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
    credentials: "include",
    signal,
  });
  return response;
}
