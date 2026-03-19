interface ExtensionHandleProfile {
  xHandle: string;
  displayName: string | null;
  avatarUrl: string | null;
  isVerified: boolean;
}

interface ExtensionAuthResult {
  user: {
    id: string;
    activeXHandle?: string | null;
  };
}

interface ExtensionHandlesHandlerDeps {
  authenticateExtensionRequest(request: Request): Promise<ExtensionAuthResult | null>;
  listExtensionHandleProfilesForUser(args: {
    userId: string;
    activeXHandle?: string | null;
  }): Promise<ExtensionHandleProfile[]>;
}

function jsonError(status: number, field: string, message: string) {
  return Response.json(
    { ok: false, errors: [{ field, message }] },
    { status },
  );
}

export async function handleExtensionHandlesGet(
  request: Request,
  deps: ExtensionHandlesHandlerDeps,
) {
  const auth = await deps.authenticateExtensionRequest(request);
  if (!auth?.user?.id) {
    return jsonError(401, "auth", "Unauthorized");
  }

  const handles = await deps.listExtensionHandleProfilesForUser({
    userId: auth.user.id,
    activeXHandle: auth.user.activeXHandle,
  });

  return Response.json({
    handles: [...handles].sort((left, right) => left.xHandle.localeCompare(right.xHandle)),
  });
}
