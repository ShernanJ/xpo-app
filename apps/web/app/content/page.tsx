import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getServerSession } from "@/lib/auth/serverSession";
import {
  buildChatWorkspaceUrl,
  normalizeWorkspaceHandle,
} from "@/lib/workspaceHandle";

export const metadata: Metadata = {
  title: "Posts & Threads",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function ContentPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    redirect("/");
  }

  const searchParams = props.searchParams ? await props.searchParams : {};
  const requestedHandle = typeof searchParams.xHandle === "string" ? searchParams.xHandle : null;
  const initialHandle = normalizeWorkspaceHandle(
    requestedHandle ?? session.user.activeXHandle ?? null,
  );
  const chatHref = buildChatWorkspaceUrl({ xHandle: initialHandle });
  const separator = chatHref.includes("?") ? "&" : "?";

  redirect(`${chatHref}${separator}modal=posts-threads`);
}
