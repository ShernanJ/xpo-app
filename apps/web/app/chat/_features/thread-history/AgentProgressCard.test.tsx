import { act, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

import {
  completeAgentProgressRun,
  createAgentProgressRun,
  buildPendingStatusPlan,
} from "../composer/pendingStatus";
import { AgentProgressCard } from "./AgentProgressCard";

test("renders a minimal live ticker with the current task and timer", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-03-16T12:00:12.000Z"));
  const progress = createAgentProgressRun({
    plan: buildPendingStatusPlan({
      message: "draft a post about retention",
      turnSource: "free_text",
    }),
    startedAtMs: new Date("2026-03-16T12:00:00.000Z").getTime(),
  });

  render(<AgentProgressCard progress={progress} />);

  expect(screen.getByText("Understanding the request")).toBeInTheDocument();
  expect(screen.getByText("0:12")).toBeInTheDocument();
  expect(
    screen.queryByText("This helps the assistant lock onto the job you want done before writing."),
  ).not.toBeInTheDocument();

  vi.useRealTimers();
});

test("renders a completed summary that opens a process dropdown", () => {
  const progress = completeAgentProgressRun(
    createAgentProgressRun({
      plan: buildPendingStatusPlan({
        message: "help me analyze this post",
        turnSource: "free_text",
      }),
      startedAtMs: 1_000,
    }),
    "completed",
    19_000,
  );

  render(<AgentProgressCard progress={progress!} variant="message" />);

  expect(screen.getByRole("button", { name: /Thought for 18s/i })).toBeInTheDocument();
  expect(screen.queryByText("Understanding what to review")).not.toBeInTheDocument();

  act(() => {
    screen.getByRole("button", { name: /Thought for 18s/i }).click();
  });

  expect(screen.getByText("Understanding what to review")).toBeInTheDocument();
  expect(
    screen.getByText("This helps the assistant focus on the post or result you want explained."),
  ).toBeInTheDocument();
});
