import { z } from "zod";

export const createOrganizationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Organization name is required")
    .max(100, "Organization name must be at most 100 characters"),
  description: z
    .string()
    .trim()
    .min(1, "Description is required")
    .max(500, "Description must be at most 500 characters"),
});

export type CreateOrganizationFormValues = z.infer<typeof createOrganizationSchema>;

export const teamConfigSchema = z.object({
  name: z.string().trim().min(1, "Team name is required"),
  status: z.enum(["active", "idle", "overloaded"]),
});

export type TeamConfigFormValues = z.infer<typeof teamConfigSchema>;
