import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth/authOptions";

export const metadata: Metadata = {
  title: "Workspace",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function ChatLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/");
  }

  return children;
}
