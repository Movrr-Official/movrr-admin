import { createSupabaseServerClient } from "@/supabase/server";
import { redirect } from "next/navigation";

interface AuthWrapperProps {
  children: React.ReactNode;
}

export default async function AuthWrapper({ children }: AuthWrapperProps) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/signin?redirectTo=/");
  }

  const { data: adminUser } = await supabase
    .from("admin_users")
    .select("role, email")
    .eq("user_id", user.id)
    .single();

  if (!adminUser) {
    redirect("/unauthorized");
  }

  return <>{children}</>;
}
