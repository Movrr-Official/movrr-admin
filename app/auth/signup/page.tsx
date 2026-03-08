import { redirect } from "next/navigation";

import { CUSTOMER_APP_SIGNUP_URL } from "@/lib/env";

export default function AdminSignupRedirectPage() {
  redirect(CUSTOMER_APP_SIGNUP_URL);
}
