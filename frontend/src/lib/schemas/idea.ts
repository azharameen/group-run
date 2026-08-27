import { z } from "zod";

export const createIdeaSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(200, "Title must be at most 200 characters"),
  signalText: z
    .string()
    .trim()
    .min(1, "Signal text is required"),
});

export type CreateIdeaFormValues = z.infer<typeof createIdeaSchema>;

export const addCommentSchema = z.object({
  commentText: z
    .string()
    .trim()
    .min(1, "Comment text cannot be empty")
    .max(5000, "Comment cannot exceed 5000 characters"),
});

export type AddCommentFormValues = z.infer<typeof addCommentSchema>;

export const maturityRecordSchema = z.object({
  stage: z.string().min(1, "Stage is required"),
  criteria: z.array(z.string().trim().min(1)).min(1, "At least one criterion is required"),
  evidence: z.array(z.string().trim().min(1)).min(1, "At least one evidence item is required"),
});

export type MaturityRecordFormValues = z.infer<typeof maturityRecordSchema>;
