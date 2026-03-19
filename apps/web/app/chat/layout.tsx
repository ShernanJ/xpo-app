import type { Metadata } from "next";
import { getServerSession } from "@/lib/auth/serverSession";
import { redirect } from "next/navigation";

const CHAT_BACKGROUND = "#050505";

export const metadata: Metadata = {
  title: {
    absolute: "Xpo",
  },
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

  return (
    <>
      <style>{`
        html,
        body {
          background-color: ${CHAT_BACKGROUND};
        }
      `}</style>
      <div className="[color-scheme:dark]">{children}</div>
    </>
  );
}
