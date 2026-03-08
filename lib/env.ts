/**
 * Environment variable validation and configuration
 * Ensures all required environment variables are present at runtime
 */

import { z } from "zod";

const booleanSchema = z.preprocess((value) => {
  if (value === "true" || value === true) return true;
  if (value === "false" || value === false) return false;
  return value;
}, z.boolean());

const booleanDefaultFalse = z.preprocess((value) => {
  if (value === "true" || value === true) return true;
  if (value === "false" || value === false) return false;
  return value;
}, z.boolean().default(false));

const publicEnvSchema = z.object({
  // Supabase (public)
  NEXT_PUBLIC_SUPABASE_URL: z.string().url("Invalid Supabase URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(1, "Supabase anon key is required"),

  // Feature flags (public)
  NEXT_PUBLIC_USE_MOCK_RIDER_LOCATIONS: booleanDefaultFalse,
  NEXT_PUBLIC_USE_MOCK_DATA: booleanDefaultFalse,

  // Application (public)
  NODE_ENV: z.enum(["development", "production", "test"]).optional(),
  NEXT_PUBLIC_APP_URL: z.string().url("Invalid NEXT_PUBLIC_APP_URL"),
  NEXT_PUBLIC_SITE_URL: z
    .string()
    .url("Invalid NEXT_PUBLIC_SITE_URL")
    .optional(),
  NEXT_PUBLIC_MAP_STYLE_URL: z
    .string()
    .url("Invalid NEXT_PUBLIC_MAP_STYLE_URL"),
  NEXT_PUBLIC_MAP_STYLE_HOT_ZONES: z
    .string()
    .url("Invalid NEXT_PUBLIC_MAP_STYLE_HOT_ZONES")
    .optional(),
  NEXT_PUBLIC_MAP_STYLE_HYBRID: z
    .string()
    .url("Invalid NEXT_PUBLIC_MAP_STYLE_HYBRID")
    .optional(),

  // Cloudinary (public)
  NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET: z.string().optional(),
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_ADVERTISER_LOGO_BUCKET: z.string().optional(),
  NEXT_PUBLIC_ADVERTISER_LOGO_MAX_FILE_SIZE_MB: z.coerce.number().positive().optional(),
});

const serverEnvSchema = publicEnvSchema
  .extend({
  // Canonical server-side application URL
  APP_URL: z.string().url("Invalid APP_URL"),

  // Database
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  // Supabase
  SUPABASE_URL: z.string().url("Invalid SUPABASE_URL"),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1, "Supabase service role key is required"),

  // Email (Resend)
  RESEND_API_KEY: z.string().min(1, "Resend API key is required"),
  FROM_EMAIL: z.string().email("Invalid FROM_EMAIL"),
  WELCOME_EMAIL: z.string().email("Invalid WELCOME_EMAIL"),
  ADMIN_EMAIL: z.string().email("Invalid ADMIN_EMAIL").optional(),
  ADMIN_EMAILS: z.string().optional(),
  SYSTEM_EMAIL: z.string().email("Invalid SYSTEM_EMAIL"),
  SUPPORT_EMAIL: z.string().email("Invalid SUPPORT_EMAIL").optional(),
  ERROR_WEBHOOK_URL: z.string().url("Invalid ERROR_WEBHOOK_URL").optional(),

  // Feature flags
  USE_MOCK_DATA: booleanDefaultFalse,

  // Route optimizer
  ROUTE_OPTIMIZER_TOKEN: z.string().optional(),
  ROUTE_OPTIMIZER_KEY: z.string().optional(),
  ROUTE_ALLOW_PREV_TOKEN: booleanDefaultFalse,
  ROUTE_OPTIMIZER_URL: z.string().url("Invalid ROUTE_OPTIMIZER_URL"),
  ROUTE_OPTIMIZER_PREV_TOKEN: z.string().optional(),
  ROUTE_OPTIMIZER_OLD_TOKEN: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.ADMIN_EMAILS) {
      const invalidEmails = value.ADMIN_EMAILS.split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .filter((recipient) => !z.string().email().safeParse(recipient).success);

      if (invalidEmails.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Invalid ADMIN_EMAILS entries: ${invalidEmails.join(", ")}`,
          path: ["ADMIN_EMAILS"],
        });
      }
    }

    const hasSingleAdminEmail = Boolean(value.ADMIN_EMAIL?.trim());
    const hasAdminEmailList = Boolean(
      value.ADMIN_EMAILS
        ?.split(",")
        .map((item) => item.trim())
        .filter(Boolean).length,
    );

    if (!hasSingleAdminEmail && !hasAdminEmailList) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide ADMIN_EMAIL or ADMIN_EMAILS",
        path: ["ADMIN_EMAIL"],
      });
    }

    if (!value.ROUTE_OPTIMIZER_TOKEN && !value.ROUTE_OPTIMIZER_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Either ROUTE_OPTIMIZER_TOKEN or ROUTE_OPTIMIZER_KEY is required",
        path: ["ROUTE_OPTIMIZER_TOKEN"],
      });
    }
  });

type PublicEnv = z.infer<typeof publicEnvSchema>;
type ServerEnv = z.infer<typeof serverEnvSchema>;

const isBrowser = typeof window !== "undefined";

function getEnv(): PublicEnv | ServerEnv {
  try {
    const publicValues = {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      NEXT_PUBLIC_USE_MOCK_RIDER_LOCATIONS:
        process.env.NEXT_PUBLIC_USE_MOCK_RIDER_LOCATIONS,
      NEXT_PUBLIC_USE_MOCK_DATA: process.env.NEXT_PUBLIC_USE_MOCK_DATA,
      NODE_ENV: process.env.NODE_ENV,
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
      NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
      NEXT_PUBLIC_MAP_STYLE_URL: process.env.NEXT_PUBLIC_MAP_STYLE_URL,
      NEXT_PUBLIC_MAP_STYLE_HOT_ZONES:
        process.env.NEXT_PUBLIC_MAP_STYLE_HOT_ZONES,
      NEXT_PUBLIC_MAP_STYLE_HYBRID: process.env.NEXT_PUBLIC_MAP_STYLE_HYBRID,
      NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET:
        process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET,
      NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME:
        process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
      NEXT_PUBLIC_SUPABASE_ADVERTISER_LOGO_BUCKET:
        process.env.NEXT_PUBLIC_SUPABASE_ADVERTISER_LOGO_BUCKET,
      NEXT_PUBLIC_ADVERTISER_LOGO_MAX_FILE_SIZE_MB:
        process.env.NEXT_PUBLIC_ADVERTISER_LOGO_MAX_FILE_SIZE_MB,
    };

    if (isBrowser) {
      return publicEnvSchema.parse(publicValues);
    }

    return serverEnvSchema.parse({
      ...publicValues,
      DATABASE_URL: process.env.DATABASE_URL,
      APP_URL: process.env.APP_URL,
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      RESEND_API_KEY: process.env.RESEND_API_KEY,
      FROM_EMAIL: process.env.FROM_EMAIL,
      WELCOME_EMAIL: process.env.WELCOME_EMAIL,
      ADMIN_EMAIL: process.env.ADMIN_EMAIL,
      ADMIN_EMAILS: process.env.ADMIN_EMAILS,
      SYSTEM_EMAIL: process.env.SYSTEM_EMAIL,
      SUPPORT_EMAIL: process.env.SUPPORT_EMAIL,
      ERROR_WEBHOOK_URL: process.env.ERROR_WEBHOOK_URL,
      USE_MOCK_DATA: process.env.USE_MOCK_DATA,
      ROUTE_OPTIMIZER_TOKEN: process.env.ROUTE_OPTIMIZER_TOKEN,
      ROUTE_OPTIMIZER_KEY: process.env.ROUTE_OPTIMIZER_KEY,
      ROUTE_ALLOW_PREV_TOKEN: process.env.ROUTE_ALLOW_PREV_TOKEN,
      ROUTE_OPTIMIZER_URL: process.env.ROUTE_OPTIMIZER_URL,
      ROUTE_OPTIMIZER_PREV_TOKEN: process.env.ROUTE_OPTIMIZER_PREV_TOKEN,
      ROUTE_OPTIMIZER_OLD_TOKEN: process.env.ROUTE_OPTIMIZER_OLD_TOKEN,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.errors
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join("\n");
      throw new Error(
        `❌ Invalid environment variables:\n${missingVars}\n\nPlease check your .env file or environment configuration.`,
      );
    }
    throw error;
  }
}

// Validate environment variables on module load
export const env = getEnv();
const serverEnv = !isBrowser ? (env as ServerEnv) : undefined;

// Export individual variables for convenience with defaults
export const DATABASE_URL = serverEnv?.DATABASE_URL ?? "";
export const APP_URL = serverEnv?.APP_URL || env.NEXT_PUBLIC_APP_URL;
export const NEXT_PUBLIC_SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
export const NEXT_PUBLIC_SUPABASE_ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const SUPABASE_URL = serverEnv?.SUPABASE_URL ?? "";
export const SUPABASE_SERVICE_ROLE_KEY =
  serverEnv?.SUPABASE_SERVICE_ROLE_KEY ?? "";
export const RESEND_API_KEY = serverEnv?.RESEND_API_KEY ?? "";
export const FROM_EMAIL = serverEnv?.FROM_EMAIL || "hello@movrr.nl";
export const WELCOME_EMAIL = serverEnv?.WELCOME_EMAIL || "welcome@movrr.nl";
export const ADMIN_EMAIL = serverEnv?.ADMIN_EMAIL || "admin@movrr.nl";
export const ADMIN_EMAILS = serverEnv?.ADMIN_EMAILS ?? "";
export const SYSTEM_EMAIL = serverEnv?.SYSTEM_EMAIL || "system@movrr.nl";
export const SUPPORT_EMAIL = serverEnv?.SUPPORT_EMAIL || "support@movrr.nl";
export const ERROR_WEBHOOK_URL = serverEnv?.ERROR_WEBHOOK_URL ?? "";
export const NEXT_PUBLIC_USE_MOCK_RIDER_LOCATIONS =
  env.NEXT_PUBLIC_USE_MOCK_RIDER_LOCATIONS;
export const NEXT_PUBLIC_USE_MOCK_DATA = env.NEXT_PUBLIC_USE_MOCK_DATA;
export const USE_MOCK_DATA = serverEnv?.USE_MOCK_DATA ?? false;
export const NODE_ENV = env.NODE_ENV || "development";
export const NEXT_PUBLIC_APP_URL = env.NEXT_PUBLIC_APP_URL;
export const NEXT_PUBLIC_SITE_URL =
  env.NEXT_PUBLIC_SITE_URL || env.NEXT_PUBLIC_APP_URL;
export const NEXT_PUBLIC_MAP_STYLE_URL = env.NEXT_PUBLIC_MAP_STYLE_URL;
export const NEXT_PUBLIC_MAP_STYLE_HOT_ZONES =
  env.NEXT_PUBLIC_MAP_STYLE_HOT_ZONES;
export const NEXT_PUBLIC_MAP_STYLE_HYBRID = env.NEXT_PUBLIC_MAP_STYLE_HYBRID;
export const NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET =
  env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET ?? "";
export const NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME =
  env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "";
export const NEXT_PUBLIC_SUPABASE_ADVERTISER_LOGO_BUCKET =
  env.NEXT_PUBLIC_SUPABASE_ADVERTISER_LOGO_BUCKET ?? "advertiser-assets";
export const NEXT_PUBLIC_ADVERTISER_LOGO_MAX_FILE_SIZE_MB =
  env.NEXT_PUBLIC_ADVERTISER_LOGO_MAX_FILE_SIZE_MB ?? 2;
export const NEXT_PUBLIC_ADVERTISER_LOGO_MAX_FILE_SIZE_BYTES =
  Math.floor(NEXT_PUBLIC_ADVERTISER_LOGO_MAX_FILE_SIZE_MB * 1024 * 1024);
export const ROUTE_OPTIMIZER_TOKEN = serverEnv?.ROUTE_OPTIMIZER_TOKEN ?? "";
export const ROUTE_OPTIMIZER_KEY = serverEnv?.ROUTE_OPTIMIZER_KEY ?? "";
export const ROUTE_ALLOW_PREV_TOKEN =
  serverEnv?.ROUTE_ALLOW_PREV_TOKEN ?? false;
export const ROUTE_OPTIMIZER_URL = serverEnv?.ROUTE_OPTIMIZER_URL ?? "";
export const ROUTE_OPTIMIZER_PREV_TOKEN =
  serverEnv?.ROUTE_OPTIMIZER_PREV_TOKEN ?? "";
export const ROUTE_OPTIMIZER_OLD_TOKEN =
  serverEnv?.ROUTE_OPTIMIZER_OLD_TOKEN ?? "";

// Helper to check if we're in production
export const isProduction = NODE_ENV === "production";
export const isDevelopment = NODE_ENV === "development";
export const isTest = NODE_ENV === "test";
