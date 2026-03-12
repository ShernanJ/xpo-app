import { redirect } from "next/navigation";

import { getServerSession } from "@/lib/auth/serverSession";
import { parseExtensionConnectParams } from "@/lib/extension/connect";
import { ExtensionConnectClient } from "./connect-client";

interface ExtensionConnectPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function pickQueryValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0]?.trim() || "";
  }

  return value?.trim() || "";
}

export default async function ExtensionConnectPage(props: ExtensionConnectPageProps) {
  const session = await getServerSession();
  const searchParams = (await props.searchParams) || {};
  const extensionId = pickQueryValue(searchParams.extensionId);
  const source = pickQueryValue(searchParams.source);

  if (!session?.user?.id) {
    const callbackUrl = `/extension/connect?extensionId=${encodeURIComponent(extensionId)}${
      source ? `&source=${encodeURIComponent(source)}` : ""
    }`;
    redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  const parsed = parseExtensionConnectParams({ extensionId, source });

  if (!parsed.ok) {
    return (
      <div className="mx-auto flex min-h-[70vh] w-full max-w-xl flex-col justify-center px-6 py-16">
        <div className="rounded-[1.75rem] border border-white/10 bg-[#050505] p-6 text-zinc-200 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
            Extension Connect
          </p>
          <h1 className="mt-4 font-mono text-3xl font-semibold tracking-tight text-white">
            Connection link is invalid
          </h1>
          <p className="mt-3 text-sm leading-6 text-zinc-400">
            {parsed.message}
          </p>
        </div>
      </div>
    );
  }

  return <ExtensionConnectClient extensionId={parsed.extensionId} />;
}
