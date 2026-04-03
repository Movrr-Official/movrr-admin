"use client";

import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/supabase/client";
import { ADMIN_USER_QUERY_KEY } from "@/hooks/useAdminUser";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function SignOutButton() {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();

  const handleSignOut = async () => {
    setIsLoading(true);

    try {
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
      queryClient.setQueryData(ADMIN_USER_QUERY_KEY, null);
      queryClient.removeQueries({
        queryKey: ADMIN_USER_QUERY_KEY,
        exact: true,
      });
      router.push("/auth/signin");
      router.refresh();
    } catch (error) {
      console.error("Error signing out:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      variant="outline"
      onClick={handleSignOut}
      disabled={isLoading}
      className="border-border/50 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-all bg-transparent gap-2"
      size="sm"
    >
      <LogOut className="h-4 w-4" />
      Sign Out
    </Button>
  );
}
