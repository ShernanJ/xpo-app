import posthog from "posthog-js";
import {
  getPostHogProjectToken,
  resolvePostHogApiHost,
  resolvePostHogUiHost,
} from "@/lib/posthog/shared";

const projectToken = getPostHogProjectToken();

if (projectToken) {
  posthog.init(projectToken, {
    api_host: resolvePostHogApiHost(),
    ui_host: resolvePostHogUiHost(),
    defaults: "2026-01-30",
    capture_exceptions: true,
    debug: process.env.NODE_ENV === "development",
  });
}
