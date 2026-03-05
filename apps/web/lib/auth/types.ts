export interface AppSessionUser {
  id: string;
  name?: string | null;
  email?: string | null;
  handle?: string;
  activeXHandle?: string | null;
}

export interface AppSession {
  user: AppSessionUser;
}

export type AppSessionStatus = "loading" | "authenticated" | "unauthenticated";
