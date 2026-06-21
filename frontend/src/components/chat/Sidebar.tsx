import { Link } from "react-router-dom";
import { useAuthStore } from "../../store/auth.store";
import { useChatStore } from "../../store/chat.store";
import s from "./Sidebar.module.css";

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  if (diffDays < 7) return d.toLocaleDateString("ko-KR", { weekday: "short" });
  return d.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
}

export default function Sidebar() {
  const user = useAuthStore((a) => a.user);
  const logout = useAuthStore((a) => a.logout);

  const conversations = useChatStore((c) => c.conversations);
  const currentConvId = useChatStore((c) => c.currentConvId);
  const credits = useChatStore((c) => c.credits);
  const loadConversation = useChatStore((c) => c.loadConversation);
  const startNewChat = useChatStore((c) => c.startNewChat);
  const deleteConversation = useChatStore((c) => c.deleteConversation);
  const setSidebarOpen = useChatStore((c) => c.setSidebarOpen);

  const handleLoadConv = (id: number) => {
    void loadConversation(id);
    setSidebarOpen(false); // close on mobile
  };

  const handleDelete = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (confirm("대화를 삭제할까요?")) void deleteConversation(id);
  };

  const creditsPercent =
    credits && !credits.isAdmin && credits.limit
      ? Math.max(0, Math.round(((credits.limit - credits.used) / credits.limit) * 100))
      : 100;

  const isLow = !credits?.isAdmin && credits?.limit != null && credits.used >= credits.limit * 0.8;

  return (
    <div className={s.sidebar}>
      {/* Header */}
      <div className={s.header}>
        <div className={s.logo}>Akasha</div>
        <button
          className={s.newChatBtn}
          onClick={() => { startNewChat(); setSidebarOpen(false); }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          새 대화
        </button>
      </div>

      {/* Conversation list */}
      <div className={s.list}>
        {conversations.length === 0 ? (
          <p className={s.listEmpty}>대화 내역이 없습니다</p>
        ) : (
          conversations.map((conv) => (
            <div
              key={conv.id}
              className={`${s.convItem} ${conv.id === currentConvId ? s.convItemActive : ""}`}
              onClick={() => handleLoadConv(conv.id)}
            >
              <span className={s.convTitle}>{conv.title ?? "새 대화"}</span>
              <span className={s.convDate}>{formatDate(conv.updatedAt)}</span>
              <button
                className={s.deleteBtn}
                onClick={(e) => handleDelete(e, conv.id)}
                aria-label="삭제"
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className={s.footer}>
        {/* Credit bar */}
        {credits && !credits.isAdmin && credits.limit != null && (
          <>
            <div className={s.credits}>
              <span className={s.creditsLabel}>크레딧</span>
              <span className={`${s.creditsValue} ${isLow ? s.creditsLow : ""}`}>
                {credits.limit - credits.used} / {credits.limit}
              </span>
            </div>
            <div className={s.creditBar}>
              <div
                className={`${s.creditBarFill} ${isLow ? s.creditBarLow : ""}`}
                style={{ width: `${creditsPercent}%` }}
              />
            </div>
          </>
        )}
        {credits?.isAdmin && (
          <div className={s.credits}>
            <span className={s.creditsLabel}>크레딧</span>
            <span className={s.creditsValue}>무제한</span>
          </div>
        )}

        {/* Admin link */}
        {user?.role === "ADMIN" && (
          <Link
            to="/admin"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 10px",
              marginBottom: 8,
              background: "rgba(19,229,106,0.08)",
              border: "1px solid rgba(19,229,106,0.25)",
              borderRadius: "var(--radius-sm)",
              color: "var(--accent)",
              fontSize: 12,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
            </svg>
            Admin Dashboard
          </Link>
        )}

        {/* User info + logout */}
        <div className={s.userRow}>
          <div className={s.userInfo}>
            <div className={s.userName}>{user?.name}</div>
            <div className={s.userEmail}>{user?.email}</div>
          </div>
          <button className={s.logoutBtn} onClick={() => void logout()}>
            로그아웃
          </button>
        </div>
      </div>
    </div>
  );
}
