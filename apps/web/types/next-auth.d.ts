import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      handle?: string;
      activeXHandle?: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    handle?: string;
    activeXHandle?: string | null;
    password?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    handle?: string;
    activeXHandle?: string | null;
  }
}
