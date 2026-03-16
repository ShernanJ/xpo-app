import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveThreadHistoryHydration,
  type ThreadHistoryMessageLike,
} from "./chatThreadHistoryState.ts";

interface TestChatMessage extends ThreadHistoryMessageLike {
  draft?: string;
  outputShape?: string;
  ideationFormatHint?: "post" | "thread" | null;
  profileAnalysisArtifact?: unknown;
}

test("resolveThreadHistoryHydration maps raw thread messages into chat messages", () => {
  const result = resolveThreadHistoryHydration<TestChatMessage>({
    rawMessages: [
      {
        id: "assistant-1",
        role: "assistant" as const,
        content: "hello",
        createdAt: "2026-03-14T12:00:00.000Z",
        threadId: "thread-1",
        feedbackValue: "up",
        data: {
          draft: "draft body",
          outputShape: "short_form_post",
          ideationFormatHint: "thread",
          profileAnalysisArtifact: {
            kind: "profile_analysis",
            profile: {
              username: "stan",
              name: "Stan",
              bio: "bio",
              avatarUrl: null,
              headerImageUrl: null,
              isVerified: false,
              followersCount: 10,
              followingCount: 20,
              createdAt: "2026-03-14T12:00:00.000Z",
            },
            pinnedPost: null,
            audit: {
              score: 80,
              headline: "Strong profile",
              fingerprint: "fp-1",
              shouldAutoOpen: false,
              steps: [],
              strengths: [],
              gaps: [],
              unknowns: [],
              bioFormulaCheck: {
                status: "pass",
                score: 80,
                summary: "Good",
                findings: [],
                bio: "bio",
                charCount: 3,
                matchesFormula: { what: true, who: true, proofOrCta: true },
                alternatives: [],
              },
              visualRealEstateCheck: {
                status: "pass",
                score: 80,
                summary: "Good",
                findings: [],
                hasHeaderImage: false,
                headerImageUrl: null,
                headerClarity: null,
                headerClarityResolved: true,
              },
              pinnedTweetCheck: {
                status: "unknown",
                score: 0,
                summary: "Unknown",
                findings: [],
                pinnedPost: null,
                category: "unknown",
                ageDays: null,
                isStale: false,
                promptSuggestions: {
                  originStory: "origin",
                  coreThesis: "core",
                },
              },
            },
          },
        },
      },
      {
        id: "user-1",
        role: "user" as const,
        content: "hey",
        createdAt: 123,
        feedbackValue: "unknown",
        data: null,
      },
    ],
    activeThreadId: "thread-fallback",
    shouldJumpToBottomAfterSwitch: true,
  });

  assert.deepEqual(result, {
    messages: [
      {
        id: "assistant-1",
        role: "assistant",
        content: "hello",
        createdAt: "2026-03-14T12:00:00.000Z",
        threadId: "thread-1",
        feedbackValue: "up",
        draft: "draft body",
        outputShape: "short_form_post",
        ideationFormatHint: "thread",
        profileAnalysisArtifact: {
          kind: "profile_analysis",
          profile: {
            username: "stan",
            name: "Stan",
            bio: "bio",
            avatarUrl: null,
            headerImageUrl: null,
            isVerified: false,
            followersCount: 10,
            followingCount: 20,
            createdAt: "2026-03-14T12:00:00.000Z",
          },
          pinnedPost: null,
          audit: {
            score: 80,
            headline: "Strong profile",
            fingerprint: "fp-1",
            shouldAutoOpen: false,
            steps: [],
            strengths: [],
            gaps: [],
            unknowns: [],
            bioFormulaCheck: {
              status: "pass",
              score: 80,
              summary: "Good",
              findings: [],
              bio: "bio",
              charCount: 3,
              matchesFormula: { what: true, who: true, proofOrCta: true },
              alternatives: [],
            },
            visualRealEstateCheck: {
              status: "pass",
              score: 80,
              summary: "Good",
              findings: [],
              hasHeaderImage: false,
              headerImageUrl: null,
              headerClarity: null,
              headerClarityResolved: true,
            },
            pinnedTweetCheck: {
              status: "unknown",
              score: 0,
              summary: "Unknown",
              findings: [],
              pinnedPost: null,
              category: "unknown",
              ageDays: null,
              isStale: false,
              promptSuggestions: {
                originStory: "origin",
                coreThesis: "core",
              },
            },
          },
        },
      },
      {
        id: "user-1",
        role: "user",
        content: "hey",
        createdAt: undefined,
        threadId: "thread-fallback",
        feedbackValue: null,
      },
    ],
    shouldJumpToBottom: true,
  });
});

test("resolveThreadHistoryHydration preserves a false jump-to-bottom plan", () => {
  const result = resolveThreadHistoryHydration<TestChatMessage>({
    rawMessages: [],
    activeThreadId: null,
    shouldJumpToBottomAfterSwitch: false,
  });

  assert.deepEqual(result, {
    messages: [],
    shouldJumpToBottom: false,
  });
});
