import type { Metadata } from "next";
import { getServerSession } from "@/lib/auth/serverSession";
import { redirect } from "next/navigation";


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
  const session = await getServerSession();

  if (!session?.user?.id) {
    redirect("/");
  }

  return <div className="[color-scheme:dark]">{children}</div>;
}
