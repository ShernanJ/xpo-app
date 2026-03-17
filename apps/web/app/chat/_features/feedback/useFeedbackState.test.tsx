import { act, renderHook } from "@testing-library/react";
import { expect, test, vi } from "vitest";

import { useFeedbackState } from "./useFeedbackState";

function createResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  } as Response;
}

function createFetchWorkspaceMock(args?: {
  onSubmit?: (body: Record<string, unknown>) => void;
}) {
  return vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "POST") {
      args?.onSubmit?.(JSON.parse(String(init.body)) as Record<string, unknown>);
      return createResponse({
        ok: true,
        data: {
          id: "submission-1",
          createdAt: "2026-03-17T12:00:00.000Z",
          profileId: "stan",
        },
      });
    }

    return createResponse({
      ok: true,
      data: {
        submissions: [],
      },
    });
  });
}

function createMessages() {
  return [
    {
      id: "user-1",
      role: "user" as const,
      content: "Write me a short thread about onboarding metrics.",
    },
    {
      id: "assistant-1",
      role: "assistant" as const,
      content: "Here is a reply about retention that does not match the ask.",
      threadId: "thread-1",
      feedbackValue: null,
    },
  ];
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

test("opens scoped feedback with the prefilled report context", async () => {
  window.localStorage.clear();

  const fetchWorkspace = createFetchWorkspaceMock();
  const { result } = renderHook(() =>
    useFeedbackState({
      activeThreadId: "thread-1",
      activeDraftMessageId: null,
      profileHandle: "stan",
      messages: createMessages(),
      fetchWorkspace,
    }),
  );

  act(() => {
    result.current.openScopedFeedbackDialog("assistant-1");
  });
  await flushEffects();

  expect(result.current.feedbackModalOpen).toBe(true);
  expect(result.current.feedbackSource).toBe("message_report");
  expect(result.current.feedbackCategory).toBe("bug_report");
  expect(result.current.feedbackScope.reportedMessageId).toBe("assistant-1");
  expect(result.current.feedbackScope.precedingUserExcerpt).toContain("onboarding metrics");
  expect(result.current.feedbackScope.assistantExcerpt).toContain("retention");
  expect(result.current.activeFeedbackDraft).toContain("What I expected");
});

test("restores a scoped draft and keeps global feedback generic", async () => {
  window.localStorage.clear();

  const fetchWorkspace = createFetchWorkspaceMock();
  const firstRender = renderHook(() =>
    useFeedbackState({
      activeThreadId: "thread-1",
      activeDraftMessageId: null,
      profileHandle: "stan",
      messages: createMessages(),
      fetchWorkspace,
    }),
  );

  act(() => {
    firstRender.result.current.openScopedFeedbackDialog("assistant-1");
  });
  await flushEffects();

  act(() => {
    firstRender.result.current.setFeedbackCategory("feature_request");
  });
  await flushEffects();

  act(() => {
    firstRender.result.current.updateActiveFeedbackTitle("Need a better report flow");
    firstRender.result.current.updateActiveFeedbackDraft(
      "Please let me report when the answer misses the ask.",
    );
  });
  await flushEffects();
  firstRender.unmount();

  const secondRender = renderHook(() =>
    useFeedbackState({
      activeThreadId: "thread-1",
      activeDraftMessageId: null,
      profileHandle: "stan",
      messages: createMessages(),
      fetchWorkspace,
    }),
  );

  act(() => {
    secondRender.result.current.openScopedFeedbackDialog("assistant-1");
  });
  await flushEffects();

  expect(secondRender.result.current.feedbackSource).toBe("message_report");
  expect(secondRender.result.current.feedbackCategory).toBe("feature_request");
  expect(secondRender.result.current.activeFeedbackTitle).toBe(
    "Need a better report flow",
  );
  expect(secondRender.result.current.activeFeedbackDraft).toContain("misses the ask");

  act(() => {
    secondRender.result.current.openFeedbackDialog();
  });
  await flushEffects();

  expect(secondRender.result.current.feedbackSource).toBe("global_feedback");
  expect(secondRender.result.current.feedbackScope.reportedMessageId).toBeNull();
  expect(secondRender.result.current.feedbackCategory).toBe("feedback");
  expect(secondRender.result.current.activeFeedbackDraft).toContain("What worked well");
  expect(secondRender.result.current.activeFeedbackDraft).not.toContain("misses the ask");
});

test("submits scoped feedback with report context and clears saved drafts", async () => {
  window.localStorage.clear();

  let submittedBody: Record<string, unknown> | null = null;
  const fetchWorkspace = createFetchWorkspaceMock({
    onSubmit: (body) => {
      submittedBody = body;
    },
  });
  const { result } = renderHook(() =>
    useFeedbackState({
      activeThreadId: "thread-1",
      activeDraftMessageId: null,
      profileHandle: "stan",
      messages: createMessages(),
      fetchWorkspace,
    }),
  );

  act(() => {
    result.current.openScopedFeedbackDialog("assistant-1");
    result.current.updateActiveFeedbackTitle("Response went off track");
    result.current.updateActiveFeedbackDraft(
      "I expected a thread about onboarding metrics, but the assistant wrote about retention instead.",
    );
  });
  await flushEffects();

  await act(async () => {
    await result.current.submitFeedback({
      preventDefault() {},
    } as React.FormEvent<HTMLFormElement>);
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(submittedBody).not.toBeNull();
  expect(submittedBody?.context).toMatchObject({
    source: "message_report",
    reportedMessageId: "assistant-1",
  });
  expect(
    (submittedBody?.context as { transcriptExcerpt?: Array<{ messageId: string }> }).transcriptExcerpt,
  ).toEqual([
    { messageId: "user-1", role: "user", excerpt: "Write me a short thread about onboarding metrics." },
    {
      messageId: "assistant-1",
      role: "assistant",
      excerpt: "Here is a reply about retention that does not match the ask.",
    },
  ]);
  expect(result.current.feedbackSubmitNotice).toContain("Feedback submitted");
  expect(window.localStorage.length).toBe(0);
});
