import { Resend } from "resend";
import UserConfirmationEmail from "@/emails/user-confirmation";
import AdminNotificationEmail from "@/emails/admin-notification";
import {
  ADMIN_EMAIL as ADMIN_EMAIL_ENV,
  RESEND_API_KEY,
  SYSTEM_EMAIL as SYSTEM_EMAIL_ENV,
  WELCOME_EMAIL as WELCOME_EMAIL_ENV,
} from "@/lib/env";

const resend = new Resend(RESEND_API_KEY);
const WELCOME_EMAIL = WELCOME_EMAIL_ENV || "welcome@movrr.nl";
const ADMIN_EMAIL = ADMIN_EMAIL_ENV || "admin@movrr.nl";
const SYSTEM_EMAIL = SYSTEM_EMAIL_ENV || "system@movrr.nl";

export async function sendUserConfirmationEmail(
  email: string,
  name: string,
  city: string,
  bikeOwnership: string,
) {
  try {
    const { data, error } = await resend.emails.send({
      from: `Movrr <${WELCOME_EMAIL}>`,
      to: [email],
      subject: "Welcome to Movrr - Transform Your Ride! 🚴‍♂️",
      react: UserConfirmationEmail({ name, city, bikeOwnership }),
    });

    if (error) {
      console.error("User confirmation email error:", error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (error) {
    console.error("User confirmation email exception:", error);
    return { success: false, error };
  }
}

export async function sendAdminNotificationEmail(
  name: string,
  email: string,
  city: string,
  bikeOwnership: string,
) {
  const timestamp = new Date().toLocaleString();

  try {
    const { data, error } = await resend.emails.send({
      from: `Movrr System <${SYSTEM_EMAIL}>`,
      to: [ADMIN_EMAIL],
      subject: `New Waitlist Registration - ${name} from ${city}`,
      react: AdminNotificationEmail({
        name,
        email,
        city,
        bikeOwnership,
        timestamp,
      }),
    });

    if (error) {
      console.error("Admin notification email error:", error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (error) {
    console.error("Admin notification email exception:", error);
    return { success: false, error };
  }
}
