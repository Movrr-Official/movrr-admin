import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ResetPasswordForm } from "./ResetPasswordForm";
import { createSupabaseServerClient } from "@/supabase/server";

export default async function ResetPasswordPage() {
  const cookieStore = await cookies();
  const recoveryAllowed =
    cookieStore.get("movrr-admin-password-recovery")?.value === "1";
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!recoveryAllowed || !user) {
    redirect("/auth/signin");
  }

  return <ResetPasswordForm />;
}
