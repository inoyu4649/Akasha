import s from "./AppLayout.module.css";
import { useChatStore } from "../../store/chat.store";

interface Props {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}

export default function AppLayout({ sidebar, children }: Props) {
  const sidebarOpen = useChatStore((st) => st.sidebarOpen);
  const setSidebarOpen = useChatStore((st) => st.setSidebarOpen);

  return (
    <div className={s.container}>
      {/* Mobile overlay */}
      <div
        className={`${s.overlay} ${sidebarOpen ? s.overlayVisible : ""}`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Sidebar */}
      <aside
        className={`${s.sidebar} ${!sidebarOpen ? s.sidebarHidden : ""} ${
          sidebarOpen ? s.sidebarMobileOpen : ""
        }`}
      >
        {sidebar}
      </aside>

      {/* Main */}
      <main className={s.main}>{children}</main>
    </div>
  );
}
