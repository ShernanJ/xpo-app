import { PostHog } from "posthog-node";
import {
  buildPostHogServerProperties,
  getPostHogProjectToken,
  readPostHogRequestContext,
  resolvePostHogHost,
} from "./shared";

function createPostHogServerClient(): PostHog | null {
  const projectToken = getPostHogProjectToken();
  if (!projectToken) {
    return null;
  }

  return new PostHog(projectToken, {
    host: resolvePostHogHost(),
    flushAt: 1,
    flushInterval: 0,
  });
}

export async function capturePostHogServerEvent(args: {
  request?: Request | null;
  distinctId: string | null | undefined;
  event: string;
  properties?: Record<string, unknown>;
}) {
  const client = createPostHogServerClient();
  const distinctId = args.distinctId?.trim();
  if (!client || !distinctId) {
    return;
  }

  await client.captureImmediate({
    distinctId,
    event: args.event,
    properties: buildPostHogServerProperties({
      request: args.request,
      properties: args.properties,
    }),
  });
}

export async function identifyPostHogServerUser(args: {
  request?: Request | null;
  distinctId: string | null | undefined;
  properties?: Record<string, unknown>;
}) {
  const client = createPostHogServerClient();
  const distinctId = args.distinctId?.trim();
  if (!client || !distinctId) {
    return;
  }

  const requestContext = readPostHogRequestContext(args.request);

  await client.identifyImmediate({
    distinctId,
    properties: {
      ...(args.properties ?? {}),
      ...(requestContext.clientDistinctId
        ? { $anon_distinct_id: requestContext.clientDistinctId }
        : {}),
    },
  });
}

export async function capturePostHogServerException(args: {
  request?: Request | null;
  distinctId?: string | null;
  error: unknown;
  properties?: Record<string, unknown>;
}) {
  const client = createPostHogServerClient();
  if (!client) {
    return;
  }

  const requestContext = readPostHogRequestContext(args.request);
  const distinctId = args.distinctId?.trim() || requestContext.clientDistinctId || undefined;

  await client.captureExceptionImmediate(
    args.error,
    distinctId,
    buildPostHogServerProperties({
      request: args.request,
      properties: args.properties,
    }),
  );
}
