import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useChatStore } from "../../store/chat.store";
import s from "./ChatMessages.module.css";

const ERROR_LABELS: Record<string, string> = {
  OUT_OF_MEMORY: "메모리 부족으로 응답을 생성할 수 없습니다. 잠시 후 다시 시도해 주세요.",
  OLLAMA_UNREACHABLE: "AI 서버에 연결할 수 없습니다. 관리자에게 문의하세요.",
  INFERENCE_FAILED: "응답 생성 중 오류가 발생했습니다.",
  CREDITS_EXHAUSTED: "오늘 사용할 수 있는 크레딧을 모두 소진했습니다.",
  NETWORK_ERROR: "네트워크 오류가 발생했습니다.",
  STREAM_ERROR: "스트림 오류가 발생했습니다. 다시 시도해 주세요.",
  MODEL_NOT_AVAILABLE: "선택한 모델을 사용할 수 없습니다.",
  QUEUE_FULL: "서버가 바쁩니다. 잠시 후 다시 시도해 주세요.",
  CONTENT_TOO_LONG: "메시지가 너무 깁니다. 8,000자 이하로 입력해 주세요.",
  TOO_MANY_REQUESTS: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
};

export default function ChatMessages() {
  const messages = useChatStore((s) => s.messages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const streamingContent = useChatStore((s) => s.streamingContent);
  const streamError = useChatStore((s) => s.streamError);

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, streamingContent]);

  if (messages.length === 0 && !isStreaming) {
    return (
      <div className={`${s.container} ${s.empty}`}>
        <p className={s.emptyTitle}>Akasha</p>
        <p className={s.emptyHint}>아래에 메시지를 입력해 대화를 시작하세요</p>
      </div>
    );
  }

  return (
    <div className={s.container}>
      {messages.map((msg, i) => (
        <div key={msg.id ?? i} className={`${s.row} ${msg.role === "user" ? s.rowUser : s.rowAssistant}`}>
          <div className={`${s.bubble} ${msg.role === "user" ? s.bubbleUser : s.bubbleAssistant}`}>
            {msg.role === "user" ? (
              msg.content
            ) : (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
            )}
          </div>
        </div>
      ))}

      {/* Streaming bubble */}
      {isStreaming && (
        <div className={`${s.row} ${s.rowAssistant}`}>
          <div className={`${s.bubble} ${s.bubbleAssistant}`}>
            {streamingContent ? (
              <>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingContent}</ReactMarkdown>
                <span className={s.cursor} />
              </>
            ) : (
              <span className={s.cursor} />
            )}
          </div>
        </div>
      )}

      {/* Error */}
      {streamError && !isStreaming && (
        <div className={s.errorRow}>
          <div className={s.errorBubble}>
            {ERROR_LABELS[streamError] ?? "오류가 발생했습니다."}
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
