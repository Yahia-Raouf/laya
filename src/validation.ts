import { z } from "zod";
import { QUESTION_TYPES } from "./auth/keys.js";

// Shared request schema for inference (used by /v1 and the admin playground).
export const questionSchema = z.object({
  type: z.enum(QUESTION_TYPES),
  instructions: z.union([z.string(), z.record(z.string(), z.unknown())]),
  criteria: z.unknown(),
});

export const inferSchema = z.object({
  state: z.unknown(),
  questions: z.record(z.string(), questionSchema),
});
