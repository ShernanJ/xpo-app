import test from "node:test";
import assert from "node:assert/strict";

import { resolveWorkspaceLoadState } from "./chatWorkspaceLoadState.ts";

test("resolveWorkspaceLoadState requests onboarding retry for missing onboarding runs", () => {
  const result = resolveWorkspaceLoadState({
    contextResponseOk: false,
    contextStatus: 404,
    contextData: {
      ok: false,
      errors: [{ message: "No onboarding run found for this account." }],
    },
    contractResponseOk: true,
    contractStatus: 200,
    contractData: {
      ok: true,
      data: { id: "contract-1" },
    },
  });

  assert.deepEqual(result, {
    status: "retry_after_onboarding",
  });
});

test("resolveWorkspaceLoadState requests onboarding retry for invalid fallback sources", () => {
  const result = resolveWorkspaceLoadState({
    contextResponseOk: true,
    contextStatus: 200,
    contextData: {
      ok: true,
      data: { runId: "ctx-1" },
    },
    contractResponseOk: false,
    contractStatus: 409,
    contractData: {
      ok: false,
      errors: [{ message: "Contract cannot rely on fallback data." }],
    },
  });

  assert.deepEqual(result, {
    status: "retry_after_onboarding",
  });
});

test("resolveWorkspaceLoadState returns the context error before contract errors", () => {
  const result = resolveWorkspaceLoadState({
    contextResponseOk: false,
    contextStatus: 500,
    contextData: {
      ok: false,
      errors: [{ message: "Context exploded." }],
    },
    contractResponseOk: false,
    contractStatus: 500,
    contractData: {
      ok: false,
      errors: [{ message: "Contract exploded." }],
    },
  });

  assert.deepEqual(result, {
    status: "error",
    errorMessage: "Context exploded.",
  });
});

test("resolveWorkspaceLoadState returns successful payloads when both responses succeed", () => {
  const result = resolveWorkspaceLoadState({
    contextResponseOk: true,
    contextStatus: 200,
    contextData: {
      ok: true,
      data: { runId: "ctx-1" },
    },
    contractResponseOk: true,
    contractStatus: 200,
    contractData: {
      ok: true,
      data: { id: "contract-1" },
    },
  });

  assert.deepEqual(result, {
    status: "success",
    contextData: { runId: "ctx-1" },
    contractData: { id: "contract-1" },
  });
});
