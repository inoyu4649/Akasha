import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import { adminApi, type AdminUser, type DailyStat, type ModelStat, type SystemStatus } from "../../api/admin.api";
import { useTheme } from "../../hooks/useTheme";
import s from "./AdminPage.module.css";

// Recharts theme colours (CSS vars not available inside SVG)
const CHART_COLORS = {
  bar: "#13e56a",
  grid: "#3a3a3a",
  text: "#9d9d9d",
  tooltip: "#2a2a2a",
};

// ── User row ──────────────────────────────────────────────────────────────
function UserRow({ user, onSaved }: { user: AdminUser; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [limit, setLimit] = useState(String(user.dailyCredits));
  const [active, setActive] = useState(user.isActive);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await adminApi.updateUser(user.id, {
        dailyCredits: parseInt(limit),
        isActive: active,
      });
      setEditing(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const creditsLeft = user.dailyCredits - user.todayUsed;
  const pct = user.dailyCredits > 0 ? Math.max(0, Math.round((creditsLeft / user.dailyCredits) * 100)) : 0;
  const isLow = pct <= 20;

  if (editing) {
    return (
      <tr className={s.editRow}>
        <td>{user.name}<br /><span style={{ fontSize: 11, color: "var(--text-muted)" }}>{user.email}</span></td>
        <td><span className={`${s.badge} ${user.role === "ADMIN" ? s.badgeAdmin : s.badgeUser}`}>{user.role}</span></td>
        <td>
          <input
            className={s.inlineInput}
            type="number"
            min={0}
            max={9999}
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
          />
        </td>
        <td>
          {user.todayUsed} / {user.dailyCredits}
        </td>
        <td>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>활성</span>
          </label>
        </td>
        <td>{user.conversationCount}</td>
        <td>
          <div className={s.actions}>
            <button className={`${s.btnSm} ${s.btnSmPrimary}`} onClick={() => void save()} disabled={saving}>
              {saving ? "저장 중" : "저장"}
            </button>
            <button className={s.btnSm} onClick={() => setEditing(false)}>취소</button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td>
        {user.name}<br />
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{user.email}</span>
      </td>
      <td><span className={`${s.badge} ${user.role === "ADMIN" ? s.badgeAdmin : s.badgeUser}`}>{user.role}</span></td>
      <td>{user.dailyCredits}</td>
      <td>
        {user.todayUsed} / {user.dailyCredits}
        <span className={s.creditBar}>
          <span className={`${s.creditBarFill} ${isLow ? s.creditBarLow : ""}`} style={{ width: `${pct}%`, display: "block" }} />
        </span>
      </td>
      <td>
        <span className={`${s.badge} ${user.isActive ? s.badgeActive : s.badgeInactive}`}>
          {user.isActive ? "활성" : "비활성"}
        </span>
      </td>
      <td>{user.conversationCount}</td>
      <td>
        <button className={s.btnSm} onClick={() => setEditing(true)}>수정</button>
      </td>
    </tr>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────
export default function AdminPage() {
  const { theme, toggle } = useTheme();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [daily, setDaily] = useState<DailyStat[]>([]);
  const [byModel, setByModel] = useState<ModelStat[]>([]);
  const [system, setSystem] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, statsRes, sysRes] = await Promise.allSettled([
        adminApi.getUsers(),
        adminApi.getStats(),
        adminApi.getSystem(),
      ]);
      if (usersRes.status === "fulfilled") setUsers(usersRes.value.data.users);
      if (statsRes.status === "fulfilled") {
        setDaily(statsRes.value.data.daily);
        setByModel(statsRes.value.data.byModel);
      }
      if (sysRes.status === "fulfilled") setSystem(sysRes.value.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const chartGrid = { stroke: CHART_COLORS.grid };
  const chartText = { fill: CHART_COLORS.text, fontSize: 11 };
  const tooltipStyle = { backgroundColor: CHART_COLORS.tooltip, border: "1px solid #3a3a3a", borderRadius: 6, fontSize: 12 };

  return (
    <div className={s.page}>
      {/* Header */}
      <div className={s.header}>
        <Link to="/" className={s.backBtn}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          채팅으로
        </Link>
        <span className={s.headerTitle}>Admin Dashboard</span>
        <button className={s.refreshBtn} onClick={() => void load()}>새로고침</button>
        <button
          onClick={toggle}
          style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--text-secondary)", cursor: "pointer" }}
          aria-label="테마 전환"
        >
          {theme === "dark" ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>
      </div>

      <div className={s.body}>
        {/* System status */}
        <div className={s.card}>
          <div className={s.cardTitle}>시스템 상태</div>
          <div className={s.statGrid}>
            <div className={s.statItem}>
              <div className={s.statLabel}>Ollama</div>
              <div className={`${s.statValue} ${s.statValueSmall}`}>
                <span className={`${s.dot} ${system?.ollama.available ? s.dotGreen : s.dotRed}`} />
                {system?.ollama.available ? "연결됨" : "연결 안 됨"}
              </div>
              {system?.ollama.currentModel && (
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                  {system.ollama.currentModel}
                </div>
              )}
            </div>
            <div className={s.statItem}>
              <div className={s.statLabel}>추론 큐</div>
              <div className={s.statValue}>{system?.queueDepth ?? 0}</div>
            </div>
            <div className={s.statItem}>
              <div className={s.statLabel}>총 유저</div>
              <div className={s.statValue}>{system?.totalUsers ?? "—"}</div>
            </div>
            <div className={s.statItem}>
              <div className={s.statLabel}>오늘 활성 유저</div>
              <div className={s.statValue}>{system?.activeToday ?? 0}</div>
            </div>
          </div>
        </div>

        {/* Charts */}
        <div className={s.chartsRow}>
          <div className={s.card}>
            <div className={s.cardTitle}>일별 크레딧 사용 (최근 7일)</div>
            {loading ? (
              <div className={s.loading}>로딩 중...</div>
            ) : daily.length === 0 ? (
              <div className={s.loading}>데이터 없음</div>
            ) : (
              <div className={s.chartWrapper}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={daily} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" {...chartGrid} />
                    <XAxis dataKey="date" tick={chartText} tickFormatter={(v: string) => v.slice(5)} />
                    <YAxis tick={chartText} allowDecimals={false} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      labelStyle={{ color: "#e8e8e8" }}
                      itemStyle={{ color: CHART_COLORS.bar }}
                      formatter={(v) => [`${Number(v)} 크레딧`, "사용량"]}
                    />
                    <Bar dataKey="totalCredits" fill={CHART_COLORS.bar} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className={s.card}>
            <div className={s.cardTitle}>모델별 크레딧 사용 (최근 7일)</div>
            {loading ? (
              <div className={s.loading}>로딩 중...</div>
            ) : byModel.length === 0 ? (
              <div className={s.loading}>데이터 없음</div>
            ) : (
              <div className={s.chartWrapper}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={byModel}
                    layout="vertical"
                    margin={{ top: 4, right: 8, left: 8, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" {...chartGrid} />
                    <XAxis type="number" tick={chartText} allowDecimals={false} />
                    <YAxis
                      type="category"
                      dataKey="modelName"
                      tick={chartText}
                      width={110}
                      tickFormatter={(v: string) => v.length > 14 ? v.slice(0, 13) + "…" : v}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      labelStyle={{ color: "#e8e8e8" }}
                      itemStyle={{ color: CHART_COLORS.bar }}
                      formatter={(v) => [`${Number(v)} 크레딧`, "사용량"]}
                    />
                    <Bar dataKey="totalCredits" fill={CHART_COLORS.bar} radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        {/* Users table */}
        <div className={s.card}>
          <div className={s.cardTitle}>유저 관리</div>
          {loading ? (
            <div className={s.loading}>로딩 중...</div>
          ) : (
            <div className={s.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>이름 / 이메일</th>
                    <th>역할</th>
                    <th>일일 한도</th>
                    <th>오늘 사용</th>
                    <th>상태</th>
                    <th>대화 수</th>
                    <th>수정</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <UserRow key={u.id} user={u} onSaved={() => void load()} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
