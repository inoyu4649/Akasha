import client from "./client";

export interface AdminUser {
  id: number;
  email: string;
  name: string;
  picture: string | null;
  role: "USER" | "ADMIN";
  dailyCredits: number;
  isActive: boolean;
  createdAt: string;
  todayUsed: number;
  conversationCount: number;
}

export interface DailyStat {
  date: string;
  totalCredits: number;
  requests: number;
}

export interface ModelStat {
  modelName: string;
  totalCredits: number;
  requests: number;
}

export interface SystemStatus {
  ollama: { available: boolean; currentModel: string | null; runningModels: string[] };
  queueDepth: number;
  totalUsers: number;
  activeToday: number;
}

export const adminApi = {
  getUsers: () => client.get<{ users: AdminUser[] }>("/admin/users"),
  updateUser: (id: number, data: { dailyCredits?: number; isActive?: boolean; role?: "USER" | "ADMIN" }) =>
    client.patch<{ user: Pick<AdminUser, "id" | "dailyCredits" | "isActive" | "role"> }>(`/admin/users/${id}`, data),
  getStats: () => client.get<{ daily: DailyStat[]; byModel: ModelStat[] }>("/admin/stats"),
  getSystem: () => client.get<SystemStatus>("/admin/system"),
};
