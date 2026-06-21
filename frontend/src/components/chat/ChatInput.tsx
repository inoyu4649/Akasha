import { useState, useRef, useEffect, useCallback } from "react";
import { useChatStore } from "../../store/chat.store";
import s from "./ChatInput.module.css";

const MAX_CONTENT_LENGTH = 8000;
const CHAR_WARN_THRESHOLD = 7000;

export default function ChatInput() {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isStreaming = useChatStore((c) => c.isStreaming);
  const sendMessage = useChatStore((c) => c.sendMessage);
  const availableModels = useChatStore((c) => c.availableModels);
  const selectedModel = useChatStore((c) => c.selectedModel);
  const setModel = useChatStore((c) => c.setModel);
  const credits = useChatStore((c) => c.credits);

  const creditsExhausted =
    !credits?.isAdmin &&
    credits?.limit != null &&
    credits.used >= credits.limit;

  const tooLong = text.length > MAX_CONTENT_LENGTH;
  const nearLimit = text.length >= CHAR_WARN_THRESHOLD;

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [text]);

  const handleSubmit = useCallback(() => {
    if (!text.trim() || isStreaming || creditsExhausted || tooLong) return;
    void sendMessage(text);
    setText("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [text, isStreaming, creditsExhausted, tooLong, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const selectedModelInfo = availableModels.find((m) => m.modelName === selectedModel);

  return (
    <div className={s.wrapper}>
      {creditsExhausted && (
        <div className={s.exhausted}>
          오늘 크레딧을 모두 사용했습니다. 내일 자정(UTC)에 초기화됩니다.
        </div>
      )}

      {/* Model selector */}
      <div className={s.modelRow}>
        <span className={s.modelLabel}>모델</span>
        <select
          className={s.modelSelect}
          value={selectedModel}
          onChange={(e) => setModel(e.target.value)}
          disabled={isStreaming}
        >
          {availableModels.length === 0 && (
            <option value="">모델 로딩 중...</option>
          )}
          {availableModels.map((m) => (
            <option key={m.modelName} value={m.modelName}>
              {m.modelName}{!m.installed ? " (미설치)" : ""}
            </option>
          ))}
        </select>
        {selectedModelInfo && (
          <span className={s.modelCost}>
            {selectedModelInfo.creditCost} 크레딧/메시지
          </span>
        )}
      </div>

      {/* Input */}
      <div className={s.inputRow}>
        <textarea
          ref={textareaRef}
          className={`${s.textarea} ${tooLong ? s.textareaError : ""}`}
          placeholder={creditsExhausted ? "크레딧 부족" : "메시지를 입력하세요 (Shift+Enter로 줄바꿈)"}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isStreaming || creditsExhausted}
          rows={1}
        />
        <button
          className={s.submitBtn}
          onClick={handleSubmit}
          disabled={!text.trim() || isStreaming || creditsExhausted || tooLong}
          aria-label="전송"
        >
          {isStreaming ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="4" height="12" rx="1" />
              <rect x="14" y="6" width="4" height="12" rx="1" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          )}
        </button>
      </div>

      <div className={s.hintRow}>
        <p className={s.hint}>Enter 전송 · Shift+Enter 줄바꿈</p>
        {nearLimit && (
          <span className={`${s.charCount} ${tooLong ? s.charCountError : s.charCountWarn}`}>
            {text.length} / {MAX_CONTENT_LENGTH}
          </span>
        )}
      </div>
    </div>
  );
}
