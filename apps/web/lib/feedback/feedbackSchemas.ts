import { z } from "zod";

export const FeedbackSourceSchema = z.enum([
  "global_feedback",
  "message_report",
]);

export const FeedbackTranscriptEntrySchema = z.object({
  messageId: z.string().trim().min(1),
  role: z.enum(["assistant", "user"]),
  excerpt: z.string().trim().min(1).max(1200),
});

export const FeedbackRequestContextSchema = z.object({
  pagePath: z.string().optional(),
  threadId: z.string().nullable().optional(),
  activeModal: z.string().nullable().optional(),
  draftMessageId: z.string().nullable().optional(),
  viewportWidth: z.number().int().positive().optional(),
  viewportHeight: z.number().int().positive().optional(),
  userAgent: z.string().optional(),
  appSurface: z.string().optional(),
  source: FeedbackSourceSchema.optional(),
  reportedMessageId: z.string().nullable().optional(),
  assistantExcerpt: z.string().trim().max(1200).nullable().optional(),
  precedingUserExcerpt: z.string().trim().max(1200).nullable().optional(),
  transcriptExcerpt: z.array(FeedbackTranscriptEntrySchema).max(6).optional(),
});

export const FeedbackContextSchema = z.object({
  pagePath: z.string().default("/chat"),
  threadId: z.string().nullable().optional(),
  activeModal: z.string().nullable().optional(),
  draftMessageId: z.string().nullable().optional(),
  viewportWidth: z.number().int().positive().optional(),
  viewportHeight: z.number().int().positive().optional(),
  userAgent: z.string().optional(),
  appSurface: z.string().default("chat"),
  source: FeedbackSourceSchema.default("global_feedback"),
  reportedMessageId: z.string().nullable().optional(),
  assistantExcerpt: z.string().trim().max(1200).nullable().optional(),
  precedingUserExcerpt: z.string().trim().max(1200).nullable().optional(),
  transcriptExcerpt: z.array(FeedbackTranscriptEntrySchema).max(6).optional(),
});

export type FeedbackSource = z.infer<typeof FeedbackSourceSchema>;
export type FeedbackTranscriptEntry = z.infer<typeof FeedbackTranscriptEntrySchema>;
export type FeedbackContext = z.infer<typeof FeedbackContextSchema>;
