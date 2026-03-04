import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateFeedbackSubmissionGuards,
  FEEDBACK_COOLDOWN_MS,
  FEEDBACK_MAX_ATTACHMENT_TOTAL_BYTES,
  FEEDBACK_RATE_LIMIT_MEDIA_MAX_PER_DAY,
  FEEDBACK_RATE_LIMIT_MAX_PER_10_MINUTES,
} from "./route.logic.ts";

function createSubmission({
  createdAt,
  message = "baseline message",
  attachments = [],
}) {
  return {
    createdAt,
    message,
    attachments,
  };
}

function makeIso(ms) {
  return new Date(ms).toISOString();
}

function makeAttachment({
  name = "screenshot.png",
  mimeType = "image/png",
  sizeBytes = 1024,
  signatureHex = "89504e470d0a1a0a0000000d49484452",
} = {}) {
  return {
    name,
    mimeType,
    sizeBytes,
    signatureHex,
  };
}

test("allows valid feedback submission", () => {
  const nowMs = Date.now();
  const result = evaluateFeedbackSubmissionGuards({
    existingSubmissions: [],
    incomingMessage: "this is valid feedback message",
    incomingAttachments: [makeAttachment()],
    nowMs,
  });

  assert.equal(result.ok, true);
});

test("blocks rapid submission burst in 10 minute window", () => {
  const nowMs = Date.now();
  const existingSubmissions = Array.from(
    { length: FEEDBACK_RATE_LIMIT_MAX_PER_10_MINUTES },
    (_, idx) =>
      createSubmission({
        createdAt: makeIso(nowMs - idx * 60_000),
        message: `feedback ${idx}`,
      }),
  );

  const result = evaluateFeedbackSubmissionGuards({
    existingSubmissions,
    incomingMessage: "new feedback body",
    incomingAttachments: [],
    nowMs,
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 429);
});

test("blocks submission during cooldown window", () => {
  const nowMs = Date.now();
  const existingSubmissions = [
    createSubmission({
      createdAt: makeIso(nowMs - FEEDBACK_COOLDOWN_MS + 2_000),
      message: "recent post",
    }),
  ];

  const result = evaluateFeedbackSubmissionGuards({
    existingSubmissions,
    incomingMessage: "new feedback body",
    incomingAttachments: [],
    nowMs,
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 429);
  assert.match(result.message, /Please wait/i);
});

test("blocks duplicate messages within duplicate window", () => {
  const nowMs = Date.now();
  const existingSubmissions = [
    createSubmission({
      createdAt: makeIso(nowMs - 5 * 60_000),
      message: "This   is THE same message",
    }),
  ];

  const result = evaluateFeedbackSubmissionGuards({
    existingSubmissions,
    incomingMessage: "this is the same message",
    incomingAttachments: [],
    nowMs,
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
});

test("blocks when media submissions exceed daily limit", () => {
  const nowMs = Date.now();
  const existingSubmissions = Array.from(
    { length: FEEDBACK_RATE_LIMIT_MEDIA_MAX_PER_DAY },
    (_, idx) =>
      createSubmission({
        createdAt: makeIso(nowMs - (11 + idx) * 60_000),
        message: `media feedback ${idx}`,
        attachments: [makeAttachment()],
      }),
  );

  const result = evaluateFeedbackSubmissionGuards({
    existingSubmissions,
    incomingMessage: "new media feedback",
    incomingAttachments: [makeAttachment()],
    nowMs,
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 429);
  assert.match(result.message, /media feedback limit/i);
});

test("blocks oversized attachment payloads", () => {
  const nowMs = Date.now();
  const result = evaluateFeedbackSubmissionGuards({
    existingSubmissions: [],
    incomingMessage: "attachment heavy feedback",
    incomingAttachments: [
      makeAttachment({
        sizeBytes: FEEDBACK_MAX_ATTACHMENT_TOTAL_BYTES + 1,
      }),
    ],
    nowMs,
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 429);
  assert.match(result.message, /attachment size/i);
});

test("rejects attachment with invalid signature", () => {
  const nowMs = Date.now();
  const result = evaluateFeedbackSubmissionGuards({
    existingSubmissions: [],
    incomingMessage: "invalid attachment feedback",
    incomingAttachments: [
      makeAttachment({
        name: "video.mp4",
        mimeType: "video/mp4",
        signatureHex: "89504e470d0a1a0a0000000d49484452",
      }),
    ],
    nowMs,
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 429);
  assert.match(result.message, /media validation/i);
});

test("accepts valid mp4 signature", () => {
  const nowMs = Date.now();
  const result = evaluateFeedbackSubmissionGuards({
    existingSubmissions: [],
    incomingMessage: "valid mp4 attachment",
    incomingAttachments: [
      makeAttachment({
        name: "clip.mp4",
        mimeType: "video/mp4",
        signatureHex: "000000206674797069736f6d00000200",
      }),
    ],
    nowMs,
  });

  assert.equal(result.ok, true);
});
