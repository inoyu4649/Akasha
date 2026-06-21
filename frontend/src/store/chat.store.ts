import { create } from "zustand";
import { conversationsApi, type ConversationSummary, type MessageRecord } from "../api/conversations.api";
import { chatApi, streamChat, type ModelInfo, type Credits } from "../api/chat.api";

export interface ChatMessage {
  id?: number;
  role: "user" | "assistant";
  content: string;
  modelName?: string | null;
}

interface ChatState {
  // Sidebar
  sidebarOpen: boolean;

  // Conversations list
  conversations: ConversationSummary[];
  currentConvId: number | null;

  // Current chat
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingContent: string;
  streamError: string | null;
  _streamAbort: AbortController | null;

  // Model selector
  selectedModel: string;
  availableModels: ModelInfo[];

  // Credits
  credits: Credits | null;

  // Actions
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  init: () => Promise<void>;
  loadConversation: (id: number) => Promise<void>;
  startNewChat: () => void;
  sendMessage: (content: string) => Promise<void>;
  deleteConversation: (id: number) => Promise<void>;
  setModel: (model: string) => void;
  refreshCredits: () => Promise<void>;
  refreshConversations: () => Promise<void>;
}

function fromRecord(m: MessageRecord): ChatMessage {
  return { id: m.id, role: m.role, content: m.content, modelName: m.modelName };
}

export const useChatStore = create<ChatState>((set, get) => ({
  sidebarOpen: true,
  conversations: [],
  currentConvId: null,
  messages: [],
  isStreaming: false,
  streamingContent: "",
  streamError: null,
  _streamAbort: null,
  selectedModel: "",
  availableModels: [],
  credits: null,

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  setModel: (model) => set({ selectedModel: model }),

  init: async () => {
    const [convRes, modelRes, creditsRes] = await Promise.allSettled([
      conversationsApi.list(),
      chatApi.getModels(),
      chatApi.getCredits(),
    ]);

    const conversations =
      convRes.status === "fulfilled" ? convRes.value.data.conversations : [];

    let models: ModelInfo[] = [];
    let defaultModel = "";
    if (modelRes.status === "fulfilled") {
      models = modelRes.value.data.models;
      // Default to cheapest installed model
      const installed = models.filter((m) => m.installed);
      const cheapest = installed.sort((a, b) => a.creditCost - b.creditCost)[0];
      defaultModel = cheapest?.modelName ?? models[0]?.modelName ?? "";
    }

    const credits = creditsRes.status === "fulfilled" ? creditsRes.value.data : null;

    set((s) => ({
      conversations,
      availableModels: models,
      selectedModel: s.selectedModel || defaultModel,
      credits,
    }));
  },

  refreshConversations: async () => {
    try {
      const { data } = await conversationsApi.list();
      set({ conversations: data.conversations });
    } catch {
      // ignore
    }
  },

  refreshCredits: async () => {
    try {
      const { data } = await chatApi.getCredits();
      set({ credits: data });
    } catch {
      // ignore
    }
  },

  loadConversation: async (id) => {
    get()._streamAbort?.abort();
    set({ currentConvId: id, messages: [], streamError: null, streamingContent: "", isStreaming: false, _streamAbort: null });
    try {
      const { data } = await conversationsApi.get(id);
      set({
        messages: data.conversation.messages.map(fromRecord),
        currentConvId: id,
      });
    } catch {
      set({ currentConvId: null });
    }
  },

  startNewChat: () => {
    get()._streamAbort?.abort();
    set({ currentConvId: null, messages: [], streamError: null, streamingContent: "", isStreaming: false, _streamAbort: null });
  },

  sendMessage: async (content: string) => {
    const { selectedModel, currentConvId } = get();
    const trimmed = content.trim();
    if (!trimmed || !selectedModel || get().isStreaming) return;

    // Optimistically add user message
    set((s) => ({
      messages: [...s.messages, { role: "user" as const, content: trimmed }],
      isStreaming: true,
      streamingContent: "",
      streamError: null,
    }));

    const abortController = new AbortController();
    set({ _streamAbort: abortController });

    let response: Response;
    try {
      response = await streamChat({ model: selectedModel, content: trimmed, conversationId: currentConvId }, abortController.signal);
    } catch {
      set((s) => ({
        messages: s.messages.slice(0, -1),
        isStreaming: false,
        streamError: abortController.signal.aborted ? null : "NETWORK_ERROR",
        _streamAbort: null,
      }));
      return;
    }

    // Non-SSE error (credit exhausted, model not available, etc.)
    if (!response.ok) {
      let errCode = "UNKNOWN";
      try {
        const body = await response.json() as { error?: string };
        errCode = body.error ?? "UNKNOWN";
      } catch { /* empty */ }

      set((s) => ({
        messages: s.messages.slice(0, -1),
        isStreaming: false,
        streamError: errCode,
      }));
      return;
    }

    // Read SSE stream
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let accumulated = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          let event: { type: string; content?: string; conversationId?: number; error?: string };
          try {
            event = JSON.parse(raw) as typeof event;
          } catch {
            continue;
          }

          if (event.type === "chunk" && event.content) {
            accumulated += event.content;
            set({ streamingContent: accumulated });
          } else if (event.type === "done") {
            set((s) => ({
              messages: [
                ...s.messages,
                { role: "assistant" as const, content: accumulated, modelName: selectedModel },
              ],
              streamingContent: "",
              isStreaming: false,
              _streamAbort: null,
              currentConvId: event.conversationId ?? s.currentConvId,
            }));
            void get().refreshConversations();
            void get().refreshCredits();
          } else if (event.type === "error") {
            set((s) => ({
              messages: s.messages.slice(0, -1),
              streamingContent: "",
              isStreaming: false,
              _streamAbort: null,
              streamError: event.error ?? "INFERENCE_FAILED",
            }));
          }
        }
      }
    } catch {
      set((s) => ({
        messages: s.messages.slice(0, -1),
        streamingContent: "",
        isStreaming: false,
        _streamAbort: null,
        streamError: abortController.signal.aborted ? null : "STREAM_ERROR",
      }));
    } finally {
      reader.releaseLock();
    }
  },

  deleteConversation: async (id) => {
    await conversationsApi.delete(id);
    set((s) => ({
      conversations: s.conversations.filter((c) => c.id !== id),
      ...(s.currentConvId === id
        ? { currentConvId: null, messages: [], streamingContent: "" }
        : {}),
    }));
  },
}));
