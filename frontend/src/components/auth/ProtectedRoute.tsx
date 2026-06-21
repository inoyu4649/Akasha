import { Navigate } from "react-router-dom";
import { useAuthStore } from "../../store/auth.store";

interface Props {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: Props) {
  const status = useAuthStore((s) => s.status);

  if (status === "idle" || status === "loading") {
    return (
      <div
        style={{
          display: "flex",
          height: "100vh",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-secondary)",
          fontSize: 14,
        }}
      >
        로딩 중...
      </div>
    );
  }

  if (status === "unauthenticated") {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
