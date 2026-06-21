export interface OllamaMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface OllamaChatChunk {
  model: string;
  done: boolean;
  message?: { role: string; content: string };
  error?: string;
}

interface OllamaModelInfo {
  name: string;
}

function ollamaUrl() {
  return process.env.OLLAMA_URL ?? "http://localhost:11434";
}

// ── Inference queue ────────────────────────────────────────────────────────
// Promise-chain approach: each task appended to the tail runs only after the
// previous task resolves or rejects. Tail never rejects, so the chain never
// breaks regardless of individual task failure.
class InferenceQueue {
  private tail: Promise<void> = Promise.resolve();
  private _pending = 0;

  get queueDepth() {
    return this._pending;
  }

  enqueue<T>(task: () => Promise<T>): Promise<T> {
    this._pending++;
    const result = this.tail.then(() => task());
    const dec = () => { this._pending = Math.max(0, this._pending - 1); };
    result.then(dec, dec);
    this.tail = result.then(() => {}, () => {});
    return result;
  }
}

export const inferenceQueue = new InferenceQueue();

// ── Ollama service ─────────────────────────────────────────────────────────
class OllamaService {
  private currentModel: string | null = null;

  get loadedModel() {
    return this.currentModel;
  }

  // Unload a model from Ollama memory by requesting it with keep_alive=0.
  // Non-fatal: if Ollama is unreachable or returns error we log and continue.
  private async unloadModel(model: string): Promise<void> {
    try {
      const res = await fetch(`${ollamaUrl()}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, prompt: "", keep_alive: 0 }),
        signal: AbortSignal.timeout(15_000),
      });
      // Consume body so connection is released
      await res.text();
      if (!res.ok) {
        console.warn(`[ollama] unload ${model} returned HTTP ${res.status}`);
      }
    } catch (err) {
      console.warn("[ollama] unload error (non-fatal):", (err as Error).message);
    }
    this.currentModel = null;
  }

  // Ensure the given model is the one loaded. If a different model is loaded,
  // unload it first. The actual load of the new model happens implicitly on
  // the first real chat/generate request.
  private async ensureModel(name: string): Promise<void> {
    if (this.currentModel === name) return;
    if (this.currentModel) {
      console.log(`[ollama] switching: unloading ${this.currentModel}`);
      await this.unloadModel(this.currentModel);
    }
    console.log(`[ollama] next model will be: ${name}`);
    this.currentModel = name;
  }

  // Stream a chat response from Ollama. Calls onChunk for each content token.
  // Throws on Ollama error; caller is responsible for catching and sending
  // error SSE event without crashing the server.
  async chat(
    model: string,
    messages: OllamaMessage[],
    onChunk: (content: string) => void,
    signal?: AbortSignal
  ): Promise<void> {
    await this.ensureModel(model);

    let res: Response;
    try {
      res = await fetch(`${ollamaUrl()}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages,
          stream: true,
          keep_alive: -1, // keep in memory; we unload manually on model switch
        }),
        signal,
      });
    } catch (err) {
      // Connection refused, timeout, or abort
      this.currentModel = null;
      if ((err as Error).name === "AbortError") throw err;
      throw new Error("OLLAMA_UNREACHABLE");
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      // OOM and load failures → clear currentModel so next request starts fresh
      if (res.status >= 500) this.currentModel = null;
      const lowerBody = body.toLowerCase();
      if (lowerBody.includes("out of memory") || lowerBody.includes("oom")) {
        throw new Error("OUT_OF_MEMORY");
      }
      throw new Error(`OLLAMA_HTTP_${res.status}`);
    }

    if (!res.body) throw new Error("OLLAMA_NO_BODY");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        // Ollama streams NDJSON: one JSON object per line
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          let chunk: OllamaChatChunk;
          try {
            chunk = JSON.parse(line) as OllamaChatChunk;
          } catch {
            continue;
          }

          if (chunk.error) {
            this.currentModel = null;
            const lower = chunk.error.toLowerCase();
            if (lower.includes("out of memory") || lower.includes("oom")) {
              throw new Error("OUT_OF_MEMORY");
            }
            throw new Error(`OLLAMA_ERROR: ${chunk.error}`);
          }

          if (chunk.message?.content) {
            onChunk(chunk.message.content);
          }

          if (chunk.done) return;
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async getStatus(): Promise<{
    available: boolean;
    currentModel: string | null;
    runningModels: string[];
  }> {
    try {
      const res = await fetch(`${ollamaUrl()}/api/ps`, {
        signal: AbortSignal.timeout(3_000),
      });
      if (!res.ok) {
        return { available: false, currentModel: this.currentModel, runningModels: [] };
      }
      const data = (await res.json()) as { models?: OllamaModelInfo[] };
      const runningModels = data.models?.map((m) => m.name) ?? [];
      return { available: true, currentModel: this.currentModel, runningModels };
    } catch {
      return { available: false, currentModel: null, runningModels: [] };
    }
  }

  async getInstalledModels(): Promise<string[]> {
    try {
      const res = await fetch(`${ollamaUrl()}/api/tags`, {
        signal: AbortSignal.timeout(3_000),
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { models?: OllamaModelInfo[] };
      return data.models?.map((m) => m.name) ?? [];
    } catch {
      return [];
    }
  }
}

export const ollama = new OllamaService();
