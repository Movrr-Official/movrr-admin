"use server";

import { z } from "zod";
import {
  sendUserConfirmationEmail,
  sendAdminNotificationEmail,
} from "@/lib/email";
import { createSupabaseServerClient } from "@/supabase/server";

const waitlistSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Please enter a valid email address"),
  city: z.string().min(2, "City must be at least 2 characters"),
  bikeOwnership: z.enum(["yes", "no", "planning"], {
    required_error: "Please select an option",
  }),
});

export type WaitlistFormData = z.infer<typeof waitlistSchema>;

export async function submitWaitlistForm(data: WaitlistFormData) {
  try {
    // Validate the data
    const validatedData = waitlistSchema.parse(data);

    const supabase = await createSupabaseServerClient();

    const { error: dbError } = await supabase.from("waitlist").insert({
      name: validatedData.name,
      email: validatedData.email,
      city: validatedData.city,
      bike_ownership: validatedData.bikeOwnership,
    });

    if (dbError) throw new Error(`Database Error: ${dbError.message}`);

    await sendUserConfirmationEmail(
      validatedData.email,
      validatedData.name,
      validatedData.city,
      validatedData.bikeOwnership
    );

    await sendAdminNotificationEmail(
      validatedData.name,
      validatedData.email,
      validatedData.city,
      validatedData.bikeOwnership
    );

    // Simulate processing delay
    await new Promise((resolve) => setTimeout(resolve, 1000));

    return { success: true, message: "Successfully joined the waitlist!" };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, errors: error.flatten().fieldErrors };
    }

    console.error("Waitlist submission error:", error);
    return {
      success: false,
      message: "Something went wrong. Please try again.",
    };
  }
}
