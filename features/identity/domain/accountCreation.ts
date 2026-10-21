import { z } from "zod";
import { accountCreationDomainSchema, rolesForDomain } from "./accountDomains";
import { accountCreationRoleSchema, userStatusSchema } from "@/schemas/user";

export const advertiserProvisioningSchema = z.object({
  companyName: z.string().trim().min(2), website: z.string().optional(),
  logoUrl: z.string().url().optional(), industry: z.string().optional(),
  language: z.string().default("en"), timezone: z.string().default("UTC"),
  budget: z.number().nonnegative().default(0),
  emailNotifications: z.boolean().default(true), campaignUpdates: z.boolean().default(true),
}).strict();
export const accountCreationSchema = z
  .object({
    email: z.string().email("Invalid email address"),
    name: z.string().min(1, "Full name is required").max(100),
    phone: z.string().optional(),
    role: accountCreationRoleSchema.optional(),
    domain: accountCreationDomainSchema,
    organisationId: z.string().uuid().optional(),
    membershipStatus: z.enum(["active", "invited"]).default("active"),
    advertiserProfile: advertiserProvisioningSchema.optional(),
    status: userStatusSchema.default("active"),
    organization: z.string().optional(),
    languagePreference: z.string().default("en"),
    isVerified: z.boolean().default(false),
    accountNotes: z.string().optional(),
    sendWelcomeEmail: z.boolean().default(true),
    city: z.string().optional(),
    country: z.string().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.domain === "user" ? value.role !== undefined : !value.role || !rolesForDomain(value.domain).includes(value.role)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Role does not belong to the selected account domain.",
        path: ["role"],
      });
    }
    if (["partner", "advertiser", "government"].includes(value.domain) && !value.organisationId &&
        !(value.domain === "advertiser" && value.role === "owner" && value.advertiserProfile)) {
      ctx.addIssue({ code: "custom", message: "Organisation is required", path: ["organisationId"] });
    }
    if (["user", "rider", "staff"].includes(value.domain) && value.organisationId) {
      ctx.addIssue({ code: "custom", message: "This domain does not use an organisation membership", path: ["organisationId"] });
    }
    if (value.domain === "user" && value.advertiserProfile) ctx.addIssue({ code: "custom", message: "User-only creation cannot add an Advertiser profile" });
    if (value.role === "rider") {
      if (!value.city?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "City is required for rider accounts",
          path: ["city"],
        });
      }
      if (!value.country?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Country is required for rider accounts",
          path: ["country"],
        });
      }
    }
  });
