import { z } from "zod";

export const proTipCategorySchema = z.enum([
  "earning",
  "timing",
  "compliance",
  "performance",
  "technical",
  "planning",
]);

export const proTipSchema = z.object({
  id: z.string(),
  icon: z.string().min(1),
  text: z.string().min(1),
  category: proTipCategorySchema.optional(),
  priority: z.number().int().min(0),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createProTipSchema = z.object({
  icon: z.string().min(1, "Icon is required").max(8, "Use a single emoji"),
  text: z
    .string()
    .min(10, "Tip text must be at least 10 characters")
    .max(300, "Tip text must be under 300 characters"),
  category: proTipCategorySchema.optional(),
  priority: z.coerce.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

export const updateProTipSchema = createProTipSchema.partial().extend({
  id: z.string(),
});

export const proTipFiltersSchema = z.object({
  searchQuery: z.string().optional(),
  category: z.string().optional(),
  isActive: z.boolean().optional(),
});

export type ProTip = z.infer<typeof proTipSchema>;
export type ProTipCategory = z.infer<typeof proTipCategorySchema>;
export type ProTipFiltersSchema = z.infer<typeof proTipFiltersSchema>;
export type CreateProTipFormData = z.infer<typeof createProTipSchema>;
export type UpdateProTipFormData = z.infer<typeof updateProTipSchema>;
