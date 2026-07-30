"use server";

import { z } from "zod";
import { requireCapability } from "@/lib/admin";

import { executeRiderDataErasure } from "@/lib/services/dataErasure";
import { logger } from "@/lib/logger";

const erasureSchema = z.object({
  riderId: z.string().uuid(),
  confirmation: z.literal("ERASE"),
});

export async function requestRiderDataErasure(input: z.infer<typeof erasureSchema>) {
  const parsed = erasureSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: "Invalid erasure request." };
  }

  try {
    const auth = await requireCapability("privacy.erase", { mutation: true });
    const result = await executeRiderDataErasure({
      riderId: parsed.data.riderId,
      requestedByAdminId: auth.authUser.id,
    });

    logger.info("Rider data erasure completed", {
      riderId: parsed.data.riderId,
      adminId: auth.authUser.id,
      gpsDeleted: result.data.gpsDeleted,
    });

    return { success: true as const, data: result.data };
  } catch (error) {
    logger.warn("Rider data erasure failed", {
      error: error instanceof Error ? error.message : String(error),
      riderId: input.riderId,
    });
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Erasure failed.",
    };
  }
}
