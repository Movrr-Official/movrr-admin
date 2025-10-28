"use client";

import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { createSupabaseBrowserClient } from "@/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function SignOutButton() {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSignOut = async () => {
    setIsLoading(true);

    try {
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
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
