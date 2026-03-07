"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { randomUUID } from "crypto";

import { requireAdmin } from "@/lib/admin";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { shouldUseMockData } from "@/lib/dataSource";
import { createUser } from "@/app/actions/users";
import { mockUsers } from "@/data/mockUsers";
import { mockCampaigns } from "@/data/mockCampaigns";
import {
  Advertiser,
  AdvertiserFiltersSchema,
  AdvertiserOption,
  createAdvertiserSchema,
  deleteAdvertiserSchema,
  updateAdvertiserSchema,
} from "@/schemas";

const DEFAULT_ADVERTISER_PAGE_SIZE = 100;
const MAX_ADVERTISER_PAGE_SIZE = 1000;

const clampPageNumber = (value: number | undefined) => {
  if (!value || Number.isNaN(value) || value < 1) return 1;
  return Math.floor(value);
};

const clampPageSize = (value: number | undefined) => {
  if (!value || Number.isNaN(value) || value < 1) {
    return DEFAULT_ADVERTISER_PAGE_SIZE;
  }
  return Math.min(Math.floor(value), MAX_ADVERTISER_PAGE_SIZE);
};

const mapUiStatusToDb = (status: string) => {
  if (status === "inactive") return "suspended";
  return status;
};

const mapDbStatusToUi = (
  status: string | null | undefined,
): "active" | "inactive" | "pending" => {
  if (!status) return "active";
  if (status === "suspended") return "inactive";
  if (status === "pending") return "pending";
  return "active";
};

const normalizeOptionalText = (value?: string | null) => {
  if (value === null || value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const normalizeWebsite = (value?: string | null) => {
  const normalized = normalizeOptionalText(value);
  if (!normalized) return undefined;
  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    return normalized;
  }
  return `https://${normalized}`;
};

const normalizeLanguage = (value?: string | null) => {
  const normalized = normalizeOptionalText(value)?.toLowerCase();
  if (!normalized) return "en";
  return /^[a-z]{2}(-[a-z]{2})?$/.test(normalized) ? normalized : "en";
};

const normalizeTimezone = (value?: string | null) => {
  const normalized = normalizeOptionalText(value);
  return normalized ?? "UTC";
};

const deriveAdvertiserStatus = (
  userRole?: string | null,
  userStatus?: string | null,
) => {
  if (!userRole || userRole !== "advertiser") {
    return "inactive" as const;
  }

  return mapDbStatusToUi(userStatus);
};

const buildAdvertiserOption = (input: {
  advertiserId: string;
  userId: string;
  companyName?: string | null;
  companyEmail?: string | null;
  contactName?: string | null;
  userEmail?: string | null;
  phone?: string | null;
  website?: string | null;
  industry?: string | null;
}): AdvertiserOption => {
  const companyName =
    normalizeOptionalText(input.companyName) ??
    normalizeOptionalText(input.contactName) ??
    normalizeOptionalText(input.userEmail) ??
    "Unnamed advertiser";

  return {
    id: input.advertiserId,
    userId: input.userId,
    companyName,
    label: companyName,
    email:
      normalizeOptionalText(input.companyEmail) ??
      normalizeOptionalText(input.userEmail),
    contactName: normalizeOptionalText(input.contactName),
    phone: normalizeOptionalText(input.phone),
    website: normalizeOptionalText(input.website),
    industry: normalizeOptionalText(input.industry),
  };
};

export async function getAdvertiserOptions(): Promise<{
  success: boolean;
  data?: AdvertiserOption[];
  error?: string;
}> {
  try {
    await requireAdmin();

    if (shouldUseMockData()) {
      const options = mockUsers
        .filter((user) => user.role === "advertiser")
        .map((user) =>
          buildAdvertiserOption({
            advertiserId: user.id,
            userId: user.id,
            companyName: user.organization ?? user.name,
            companyEmail: user.email,
            contactName: user.name,
            userEmail: user.email,
            phone: user.phone,
          }),
        );

      return { success: true, data: options };
    }

    const supabaseAdmin = createSupabaseAdminClient();
    const { data: advertisers, error } = await supabaseAdmin
      .from("advertiser")
      .select(
        "id, user_id, company_name, company_email, website, industry, created_at",
      )
      .order("created_at", { ascending: false });

    if (error) {
      return { success: false, error: error.message };
    }

    const userIds = (advertisers ?? [])
      .map((advertiser) => advertiser.user_id)
      .filter((id): id is string => Boolean(id));

    const { data: users, error: usersError } = userIds.length
      ? await supabaseAdmin
          .from("user")
          .select("id, name, email, phone")
          .in("id", userIds)
      : { data: [], error: null };

    if (usersError) {
      return { success: false, error: usersError.message };
    }

    const userMap = new Map((users ?? []).map((user) => [user.id, user]));

    const options = (advertisers ?? [])
      .map((advertiser) => {
        if (!advertiser.user_id) return null;
        const user = userMap.get(advertiser.user_id);
        return buildAdvertiserOption({
          advertiserId: advertiser.id,
          userId: advertiser.user_id,
          companyName: advertiser.company_name,
          companyEmail: advertiser.company_email,
          contactName: user?.name,
          userEmail: user?.email,
          phone: user?.phone,
          website: advertiser.website,
          industry: advertiser.industry,
        });
      })
      .filter((option): option is AdvertiserOption => Boolean(option));

    return { success: true, data: options };
  } catch (error) {
    console.error("Get advertiser options error:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to fetch advertiser options",
    };
  }
}

export async function getAdvertisers(
  filters?: AdvertiserFiltersSchema,
): Promise<{
  success: boolean;
  data?: Advertiser[];
  error?: string;
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}> {
  try {
    await requireAdmin();
    const page = clampPageNumber(filters?.page);
    const pageSize = clampPageSize(filters?.pageSize);

    if (shouldUseMockData()) {
      const advertisers = mockUsers
        .filter((user) => user.role === "advertiser")
        .map((user) => {
          const advertiserCampaigns = mockCampaigns.filter(
            (campaign) => campaign.advertiserId === user.id,
          );
          const activeCampaigns = advertiserCampaigns.filter(
            (campaign) => campaign.status === "active",
          ).length;
          const totalImpressions = advertiserCampaigns.reduce(
            (total, campaign) => total + (campaign.impressions || 0),
            0,
          );

          return {
            id: user.id,
            userId: user.id,
            companyName: user.organization || user.name,
            contactName: user.name,
            email: user.email,
            phone: user.phone,
            website: undefined,
            logoUrl: undefined,
            industry: undefined,
            language: "en",
            timezone: "UTC",
            emailNotifications: undefined,
            campaignUpdates: undefined,
            verified: Boolean(user.isVerified),
            budget: 0,
            totalCampaigns: advertiserCampaigns.length,
            activeCampaigns,
            totalImpressions,
            ridersEngaged: 0,
            status: user.status,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
          } as Advertiser;
        });

      const total = advertisers.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const offset = (page - 1) * pageSize;
      const paginated = advertisers.slice(offset, offset + pageSize);
      return {
        success: true,
        data: paginated,
        pagination: {
          page,
          pageSize,
          total,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
      };
    }

    const supabaseAdmin = createSupabaseAdminClient();
    const offset = (page - 1) * pageSize;
    const upperBound = offset + pageSize - 1;
    let query = supabaseAdmin.from("advertiser").select(
      "id, user_id, company_name, company_email, website, logo_url, industry, language, timezone, email_notifications, campaign_updates, verified, budget, created_at, total_impressions, riders_engaged",
      { count: "exact" },
    );

    if (filters?.industry) {
      query = query.ilike("industry", `%${filters.industry.trim()}%`);
    }

    if (filters?.dateRange?.from) {
      query = query.gte("created_at", filters.dateRange.from.toISOString());
    }

    if (filters?.dateRange?.to) {
      query = query.lte("created_at", filters.dateRange.to.toISOString());
    }

    if (filters?.searchQuery) {
      const q = filters.searchQuery.trim();
      if (q) {
        query = query.or(`company_name.ilike.%${q}%,company_email.ilike.%${q}%`);
      }
    }

    const {
      data: advertisers,
      error,
      count: totalCount,
    } = await query
      .order("created_at", {
        ascending: false,
      })
      .range(offset, upperBound);

    if (error) {
      return { success: false, error: error.message };
    }

    const userIds = (advertisers ?? [])
      .map((advertiser) => advertiser.user_id)
      .filter((id): id is string => Boolean(id));

    const { data: users, error: usersError } = userIds.length
      ? await supabaseAdmin
          .from("user")
          .select("id, name, email, phone, role, status, updated_at")
          .in("id", userIds)
      : { data: [], error: null };

    if (usersError) {
      return { success: false, error: usersError.message };
    }

    const advertiserIds = (advertisers ?? []).map((advertiser) => advertiser.id);
    const { data: campaigns, error: campaignsError } = advertiserIds.length
      ? await supabaseAdmin
          .from("campaign")
          .select("id, advertiser_id, lifecycle_status, impressions")
          .in("advertiser_id", advertiserIds)
      : { data: [], error: null };

    if (campaignsError) {
      return { success: false, error: campaignsError.message };
    }

    const campaignsByAdvertiser = new Map<
      string,
      { totalCampaigns: number; activeCampaigns: number; totalImpressions: number }
    >();

    (campaigns ?? []).forEach((campaign) => {
      const current = campaignsByAdvertiser.get(campaign.advertiser_id) ?? {
        totalCampaigns: 0,
        activeCampaigns: 0,
        totalImpressions: 0,
      };

      current.totalCampaigns += 1;
      if (campaign.lifecycle_status === "active") {
        current.activeCampaigns += 1;
      }
      current.totalImpressions += Number(campaign.impressions ?? 0);
      campaignsByAdvertiser.set(campaign.advertiser_id, current);
    });

    const userMap = new Map((users ?? []).map((user) => [user.id, user]));

    let mapped = (advertisers ?? []).map((advertiser) => {
      const linkedUser = advertiser.user_id
        ? userMap.get(advertiser.user_id)
        : undefined;

      const campaignStats = campaignsByAdvertiser.get(advertiser.id) ?? {
        totalCampaigns: 0,
        activeCampaigns: 0,
        totalImpressions: 0,
      };

      return {
        id: advertiser.id,
        userId: advertiser.user_id ?? advertiser.id,
        companyName:
          normalizeOptionalText(advertiser.company_name) ??
          normalizeOptionalText(linkedUser?.name) ??
          normalizeOptionalText(advertiser.company_email) ??
          "Unnamed advertiser",
        contactName: normalizeOptionalText(linkedUser?.name),
        email:
          normalizeOptionalText(advertiser.company_email) ??
          normalizeOptionalText(linkedUser?.email),
        phone: normalizeOptionalText(linkedUser?.phone),
        website: normalizeOptionalText(advertiser.website),
        logoUrl: normalizeOptionalText(advertiser.logo_url),
        industry: normalizeOptionalText(advertiser.industry),
        language: normalizeLanguage(advertiser.language),
        timezone: normalizeTimezone(advertiser.timezone),
        emailNotifications:
          advertiser.email_notifications === null
            ? undefined
            : Boolean(advertiser.email_notifications),
        campaignUpdates:
          advertiser.campaign_updates === null
            ? undefined
            : Boolean(advertiser.campaign_updates),
        verified: Boolean(advertiser.verified),
        budget: Number(advertiser.budget ?? 0),
        totalCampaigns: campaignStats.totalCampaigns,
        activeCampaigns: campaignStats.activeCampaigns,
        totalImpressions:
          Number(advertiser.total_impressions ?? 0) ||
          campaignStats.totalImpressions,
        ridersEngaged: Number(advertiser.riders_engaged ?? 0),
        status: deriveAdvertiserStatus(linkedUser?.role, linkedUser?.status),
        createdAt: advertiser.created_at ?? new Date().toISOString(),
        updatedAt:
          linkedUser?.updated_at ??
          advertiser.created_at ??
          new Date().toISOString(),
      } as Advertiser;
    });

    const total = totalCount ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    return {
      success: true,
      data: mapped,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  } catch (error) {
    console.error("Get advertisers error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch advertisers",
    };
  }
}

export async function getAdvertiserById(
  id: string,
): Promise<{ success: boolean; data?: Advertiser; error?: string }> {
  try {
    await requireAdmin();

    if (shouldUseMockData()) {
      const result = await getAdvertisers({ page: 1, pageSize: 1000 });
      if (!result.success || !result.data) {
        return {
          success: false,
          error: result.error || "Failed to fetch advertiser",
        };
      }

      const advertiser = result.data.find((item) => item.id === id);
      if (!advertiser) {
        return { success: false, error: "Advertiser not found" };
      }

      return { success: true, data: advertiser };
    }

    const supabaseAdmin = createSupabaseAdminClient();
    const { data: advertiser, error: advertiserError } = await supabaseAdmin
      .from("advertiser")
      .select(
        "id, user_id, company_name, company_email, website, logo_url, industry, language, timezone, email_notifications, campaign_updates, verified, budget, created_at, total_impressions, riders_engaged",
      )
      .eq("id", id)
      .maybeSingle();

    if (advertiserError) {
      return { success: false, error: advertiserError.message };
    }

    if (!advertiser) {
      return { success: false, error: "Advertiser not found" };
    }

    const { data: linkedUser, error: userError } = advertiser.user_id
      ? await supabaseAdmin
          .from("user")
          .select("id, name, email, phone, role, status, updated_at")
          .eq("id", advertiser.user_id)
          .maybeSingle()
      : { data: null, error: null };

    if (userError) {
      return { success: false, error: userError.message };
    }

    const { count: campaignCount, error: campaignCountError } = await supabaseAdmin
      .from("campaign")
      .select("id", { count: "exact", head: true })
      .eq("advertiser_id", advertiser.id);

    if (campaignCountError) {
      return { success: false, error: campaignCountError.message };
    }

    const { count: activeCampaignCount, error: activeCampaignsError } =
      await supabaseAdmin
        .from("campaign")
        .select("id", { count: "exact", head: true })
        .eq("advertiser_id", advertiser.id)
        .eq("lifecycle_status", "active");

    if (activeCampaignsError) {
      return { success: false, error: activeCampaignsError.message };
    }

    const mapped = {
      id: advertiser.id,
      userId: advertiser.user_id ?? advertiser.id,
      companyName:
        normalizeOptionalText(advertiser.company_name) ??
        normalizeOptionalText(linkedUser?.name) ??
        normalizeOptionalText(advertiser.company_email) ??
        "Unnamed advertiser",
      contactName: normalizeOptionalText(linkedUser?.name),
      email:
        normalizeOptionalText(advertiser.company_email) ??
        normalizeOptionalText(linkedUser?.email),
      phone: normalizeOptionalText(linkedUser?.phone),
      website: normalizeOptionalText(advertiser.website),
      logoUrl: normalizeOptionalText(advertiser.logo_url),
      industry: normalizeOptionalText(advertiser.industry),
      language: normalizeLanguage(advertiser.language),
      timezone: normalizeTimezone(advertiser.timezone),
      emailNotifications:
        advertiser.email_notifications === null
          ? undefined
          : Boolean(advertiser.email_notifications),
      campaignUpdates:
        advertiser.campaign_updates === null
          ? undefined
          : Boolean(advertiser.campaign_updates),
      verified: Boolean(advertiser.verified),
      budget: Number(advertiser.budget ?? 0),
      totalCampaigns: Number(campaignCount ?? 0),
      activeCampaigns: Number(activeCampaignCount ?? 0),
      totalImpressions: Number(advertiser.total_impressions ?? 0),
      ridersEngaged: Number(advertiser.riders_engaged ?? 0),
      status: deriveAdvertiserStatus(linkedUser?.role, linkedUser?.status),
      createdAt: advertiser.created_at ?? new Date().toISOString(),
      updatedAt:
        linkedUser?.updated_at ?? advertiser.created_at ?? new Date().toISOString(),
    } as Advertiser;

    return { success: true, data: mapped };
  } catch (error) {
    console.error("Get advertiser by id error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch advertiser",
    };
  }
}

export async function createAdvertiserProfile(
  data: z.infer<typeof createAdvertiserSchema>,
): Promise<{ success: boolean; data?: AdvertiserOption; error?: string }> {
  try {
    await requireAdmin();
    const validatedData = createAdvertiserSchema.parse(data);

    if (shouldUseMockData()) {
      const id = randomUUID();
      return {
        success: true,
        data: {
          id,
          userId: id,
          companyName: validatedData.companyName.trim(),
          label: validatedData.companyName.trim(),
          email: validatedData.email.trim().toLowerCase(),
          contactName: validatedData.contactName.trim(),
          phone: normalizeOptionalText(validatedData.phone),
          website: normalizeWebsite(validatedData.website),
          industry: normalizeOptionalText(validatedData.industry),
        },
      };
    }

    const supabaseAdmin = createSupabaseAdminClient();
    const normalizedEmail = validatedData.email.trim().toLowerCase();
    const normalizedCompanyName = validatedData.companyName.trim();
    const normalizedContactName = validatedData.contactName.trim();
    const normalizedPhone = normalizeOptionalText(validatedData.phone);
    const normalizedWebsite = normalizeWebsite(validatedData.website);
    const normalizedLogoUrl = normalizeOptionalText(validatedData.logoUrl);
    const normalizedIndustry = normalizeOptionalText(validatedData.industry);
    const normalizedLanguage = normalizeLanguage(validatedData.language);
    const normalizedTimezone = normalizeTimezone(validatedData.timezone);
    const normalizedBudget = Number(validatedData.budget ?? 0);
    const emailNotifications = validatedData.emailNotifications ?? true;
    const campaignUpdates = validatedData.campaignUpdates ?? true;

    const { data: existingUser, error: existingUserError } = await supabaseAdmin
      .from("user")
      .select("id, role, name, email, phone, status")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (existingUserError) {
      return { success: false, error: existingUserError.message };
    }

    let advertiserUserId = existingUser?.id;
    let createdUserId: string | null = null;

    if (existingUser) {
      if (existingUser.role !== "advertiser") {
        return {
          success: false,
          error:
            "A user with this email already exists with a non-advertiser role. Update role to advertiser or use another email.",
        };
      }
    } else {
      const createUserResult = await createUser({
        email: normalizedEmail,
        name: normalizedContactName,
        phone: normalizedPhone,
        role: "advertiser",
        status: validatedData.status,
        organization: normalizedCompanyName,
        languagePreference: normalizedLanguage,
        isVerified: false,
        accountNotes: "Created from advertiser operations.",
        sendWelcomeEmail: validatedData.sendWelcomeEmail,
        allowAdvertiserBootstrap: true,
      });

      if (!createUserResult.success || !createUserResult.data) {
        return {
          success: false,
          error: createUserResult.error || "Failed to create advertiser user",
        };
      }

      advertiserUserId = createUserResult.data.id;
      createdUserId = createUserResult.data.id;
    }

    if (!advertiserUserId) {
      return {
        success: false,
        error: "Unable to resolve advertiser user profile.",
      };
    }

    const { error: updateUserError } = await supabaseAdmin
      .from("user")
      .update({
        role: "advertiser",
        name: normalizedContactName,
        phone: normalizedPhone,
        status: mapUiStatusToDb(validatedData.status),
        organization: normalizedCompanyName,
        updated_at: new Date().toISOString(),
      })
      .eq("id", advertiserUserId);

    if (updateUserError) {
      return { success: false, error: updateUserError.message };
    }

    const { data: existingAdvertiser, error: existingAdvertiserError } =
      await supabaseAdmin
        .from("advertiser")
        .select("id")
        .eq("user_id", advertiserUserId)
        .maybeSingle();

    if (existingAdvertiserError) {
      return { success: false, error: existingAdvertiserError.message };
    }

    let advertiserId = existingAdvertiser?.id;

    if (existingAdvertiser?.id) {
      const { error: advertiserUpdateError } = await supabaseAdmin
        .from("advertiser")
        .update({
          company_name: normalizedCompanyName,
          company_email: normalizedEmail,
          website: normalizedWebsite,
          logo_url: normalizedLogoUrl,
          industry: normalizedIndustry,
          language: normalizedLanguage,
          timezone: normalizedTimezone,
          email_notifications: emailNotifications,
          campaign_updates: campaignUpdates,
          budget: normalizedBudget,
        })
        .eq("id", existingAdvertiser.id);

      if (advertiserUpdateError) {
        return { success: false, error: advertiserUpdateError.message };
      }
    } else {
      const { data: insertedAdvertiser, error: insertError } = await supabaseAdmin
        .from("advertiser")
        .insert({
          user_id: advertiserUserId,
          company_name: normalizedCompanyName,
          company_email: normalizedEmail,
          website: normalizedWebsite,
          logo_url: normalizedLogoUrl,
          industry: normalizedIndustry,
          verified: false,
          budget: normalizedBudget,
          language: normalizedLanguage,
          timezone: normalizedTimezone,
          email_notifications: emailNotifications,
          campaign_updates: campaignUpdates,
          created_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (insertError || !insertedAdvertiser?.id) {
        if (createdUserId) {
          await supabaseAdmin.from("user").delete().eq("id", createdUserId);
          await supabaseAdmin.auth.admin.deleteUser(createdUserId);
        }
        return {
          success: false,
          error: insertError?.message || "Failed to create advertiser profile",
        };
      }

      advertiserId = insertedAdvertiser.id;
    }

    if (!advertiserId) {
      return { success: false, error: "Failed to resolve advertiser profile id" };
    }

    revalidatePath("/advertisers");
    revalidatePath("/campaigns");
    revalidatePath("/campaigns/create");
    revalidatePath("/users");

    return {
      success: true,
      data: {
        id: advertiserId,
        userId: advertiserUserId,
        companyName: normalizedCompanyName,
        label: normalizedCompanyName,
        email: normalizedEmail,
        contactName: normalizedContactName,
        phone: normalizedPhone,
        website: normalizedWebsite,
        industry: normalizedIndustry,
      },
    };
  } catch (error) {
    console.error("Create advertiser profile error:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to create advertiser profile",
    };
  }
}

export async function updateAdvertiserProfile(
  data: z.infer<typeof updateAdvertiserSchema>,
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin();
    const validatedData = updateAdvertiserSchema.parse(data);

    if (shouldUseMockData()) {
      return { success: true };
    }

    const supabaseAdmin = createSupabaseAdminClient();
    const { data: advertiser, error: advertiserError } = await supabaseAdmin
      .from("advertiser")
      .select("id, user_id, company_email")
      .eq("id", validatedData.id)
      .maybeSingle();

    if (advertiserError) {
      return { success: false, error: advertiserError.message };
    }

    if (!advertiser?.id || !advertiser.user_id) {
      return { success: false, error: "Advertiser profile not found" };
    }

    const { data: linkedUser, error: linkedUserError } = await supabaseAdmin
      .from("user")
      .select("id, email")
      .eq("id", advertiser.user_id)
      .maybeSingle();

    if (linkedUserError) {
      return { success: false, error: linkedUserError.message };
    }

    if (!linkedUser?.id) {
      return { success: false, error: "Linked advertiser user not found" };
    }

    const nextEmail = normalizeOptionalText(validatedData.email)?.toLowerCase();
    if (nextEmail) {
      const { data: existingUser, error: existingUserError } = await supabaseAdmin
        .from("user")
        .select("id, role")
        .eq("email", nextEmail)
        .maybeSingle();

      if (existingUserError) {
        return { success: false, error: existingUserError.message };
      }

      if (existingUser && existingUser.id !== advertiser.user_id) {
        return {
          success: false,
          error: "Another user already uses this email address.",
        };
      }
    }

    const previousEmail = normalizeOptionalText(linkedUser.email)?.toLowerCase();
    const shouldSyncAuthEmail =
      nextEmail !== undefined && nextEmail !== previousEmail;

    if (shouldSyncAuthEmail) {
      const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(
        advertiser.user_id,
        { email: nextEmail },
      );

      if (authUpdateError) {
        return {
          success: false,
          error: `Failed to update authentication email: ${authUpdateError.message}`,
        };
      }
    }

    const userUpdateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      role: "advertiser",
    };

    if (validatedData.contactName !== undefined) {
      userUpdateData.name = validatedData.contactName.trim();
    }
    if (nextEmail !== undefined) {
      userUpdateData.email = nextEmail;
    }
    if (validatedData.phone !== undefined) {
      userUpdateData.phone = normalizeOptionalText(validatedData.phone);
    }
    if (validatedData.status !== undefined) {
      userUpdateData.status = mapUiStatusToDb(validatedData.status);
    }
    if (validatedData.companyName !== undefined) {
      userUpdateData.organization = normalizeOptionalText(validatedData.companyName);
    }
    if (validatedData.language !== undefined) {
      userUpdateData.language_preference = normalizeLanguage(validatedData.language);
    }

    const { error: userUpdateError } = await supabaseAdmin
      .from("user")
      .update(userUpdateData)
      .eq("id", advertiser.user_id);

    if (userUpdateError) {
      return { success: false, error: userUpdateError.message };
    }

    const advertiserUpdateData: Record<string, unknown> = {};
    if (validatedData.companyName !== undefined) {
      advertiserUpdateData.company_name = validatedData.companyName.trim();
    }
    if (nextEmail !== undefined) {
      advertiserUpdateData.company_email = nextEmail;
    }
    if (validatedData.website !== undefined) {
      advertiserUpdateData.website = normalizeWebsite(validatedData.website);
    }
    if (validatedData.logoUrl !== undefined) {
      advertiserUpdateData.logo_url = normalizeOptionalText(validatedData.logoUrl);
    }
    if (validatedData.industry !== undefined) {
      advertiserUpdateData.industry = normalizeOptionalText(validatedData.industry);
    }
    if (validatedData.language !== undefined) {
      advertiserUpdateData.language = normalizeLanguage(validatedData.language);
    }
    if (validatedData.timezone !== undefined) {
      advertiserUpdateData.timezone = normalizeTimezone(validatedData.timezone);
    }
    if (validatedData.emailNotifications !== undefined) {
      advertiserUpdateData.email_notifications = validatedData.emailNotifications;
    }
    if (validatedData.campaignUpdates !== undefined) {
      advertiserUpdateData.campaign_updates = validatedData.campaignUpdates;
    }
    if (validatedData.budget !== undefined) {
      advertiserUpdateData.budget = Number(validatedData.budget);
    }
    if (validatedData.verified !== undefined) {
      advertiserUpdateData.verified = validatedData.verified;
    }

    if (Object.keys(advertiserUpdateData).length > 0) {
      const { error: advertiserUpdateError } = await supabaseAdmin
        .from("advertiser")
        .update(advertiserUpdateData)
        .eq("id", validatedData.id);

      if (advertiserUpdateError) {
        return { success: false, error: advertiserUpdateError.message };
      }
    }

    revalidatePath("/advertisers");
    revalidatePath("/campaigns");
    revalidatePath("/users");
    return { success: true };
  } catch (error) {
    console.error("Update advertiser profile error:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to update advertiser profile",
    };
  }
}

export async function deleteAdvertiserProfile(
  data: z.infer<typeof deleteAdvertiserSchema>,
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin();
    const validatedData = deleteAdvertiserSchema.parse(data);

    if (shouldUseMockData()) {
      return { success: true };
    }

    const supabaseAdmin = createSupabaseAdminClient();

    const { count: campaignCount, error: campaignCountError } = await supabaseAdmin
      .from("campaign")
      .select("id", { count: "exact", head: true })
      .eq("advertiser_id", validatedData.id);

    if (campaignCountError) {
      return { success: false, error: campaignCountError.message };
    }

    if ((campaignCount ?? 0) > 0) {
      return {
        success: false,
        error:
          "Cannot delete advertiser profile with active campaign history. Reassign or archive campaigns first.",
      };
    }

    const { error: deleteError } = await supabaseAdmin
      .from("advertiser")
      .delete()
      .eq("id", validatedData.id);

    if (deleteError) {
      return { success: false, error: deleteError.message };
    }

    revalidatePath("/advertisers");
    revalidatePath("/campaigns");
    revalidatePath("/users");
    return { success: true };
  } catch (error) {
    console.error("Delete advertiser profile error:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to delete advertiser profile",
    };
  }
}
