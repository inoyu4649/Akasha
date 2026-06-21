import { StrictMode, Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override render() {
    if (this.state.error) {
      return (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", height: "100vh", gap: 16, padding: 24,
          background: "var(--bg-base)", color: "var(--text-primary)",
          fontFamily: "var(--font-sans)",
        }}>
          <p style={{ fontSize: 18, fontWeight: 600, color: "var(--danger)" }}>오류가 발생했습니다</p>
          <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>페이지를 새로고침해 주세요.</p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "8px 20px", background: "var(--accent-dark)", color: "#fff",
              border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 13,
            }}
          >
            새로고침
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
