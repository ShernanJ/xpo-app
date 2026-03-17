import posthog from "posthog-js";
import { resolvePostHogApiHost, resolvePostHogUiHost } from "@/lib/posthog/shared";

const projectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN?.trim();

if (projectToken) {
  posthog.init(projectToken, {
    api_host: resolvePostHogApiHost(),
    ui_host: resolvePostHogUiHost(),
    defaults: "2026-01-30",
    capture_exceptions: true,
    debug: process.env.NODE_ENV === "development",
  });
}
