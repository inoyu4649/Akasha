import client from "./client";

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  picture: string | null;
  role: "USER" | "ADMIN";
  dailyCredits: number;
  isActive: boolean;
}

export const authApi = {
  me: () => client.get<{ user: AuthUser }>("/auth/me"),
  refresh: () => client.post<{ ok: boolean }>("/auth/refresh"),
  logout: () => client.post<{ ok: boolean }>("/auth/logout"),
};
