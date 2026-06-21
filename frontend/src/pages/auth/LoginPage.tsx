import { useSearchParams } from "react-router-dom";
import { useTheme } from "../../hooks/useTheme";
import AuthLayout, { css as s } from "../../components/layout/AuthLayout";

const ERROR_MESSAGES: Record<string, string> = {
  DOMAIN_NOT_ALLOWED: "HAFS(@hafs.hs.kr) 계정으로만 로그인할 수 있습니다.",
  ACCOUNT_DEACTIVATED: "비활성화된 계정입니다. 관리자에게 문의하세요.",
  EMAIL_NOT_VERIFIED: "이메일 인증이 완료되지 않은 계정입니다.",
  OAUTH_FAILED: "로그인 중 오류가 발생했습니다. 다시 시도해 주세요.",
  oauth_failed: "로그인 중 오류가 발생했습니다. 다시 시도해 주세요.",
};

export default function LoginPage() {
  const [params] = useSearchParams();
  const { theme, toggle } = useTheme();

  const errorCode = params.get("error");
  const errorMsg = errorCode ? (ERROR_MESSAGES[errorCode] ?? ERROR_MESSAGES.OAUTH_FAILED) : null;

  return (
    <>
      <button
        onClick={toggle}
        aria-label="테마 전환"
        style={{
          position: "fixed",
          top: 16,
          right: 16,
          background: "var(--bg-input)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)",
          color: "var(--text-secondary)",
          width: 36,
          height: 36,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          zIndex: 100,
        }}
      >
        {theme === "dark" ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        )}
      </button>

      <AuthLayout title="Akasha">
        {errorMsg && <div className={s.alertError}>{errorMsg}</div>}

        <p
          style={{
            textAlign: "center",
            color: "var(--text-secondary)",
            fontSize: 13,
            marginBottom: 24,
            lineHeight: 1.6,
          }}
        >
          HAFS AI 채팅 서비스
        </p>

        <a href="/api/auth/google" style={{ display: "block", textDecoration: "none" }}>
          <button className={s.btnGoogle} type="button">
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.28-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
            </svg>
            Google로 로그인
          </button>
        </a>

        <p className={s.googleHint}>@hafs.hs.kr 계정으로만 로그인 가능합니다</p>
      </AuthLayout>
    </>
  );
}
