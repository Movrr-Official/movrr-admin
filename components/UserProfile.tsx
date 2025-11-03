"use client";

import { useTransition } from "react";
import { User, LogOut, LifeBuoy } from "lucide-react";

import { AdminRole } from "@/types/auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getRoleBadge } from "./UserRole";
import { signOut } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/useToast";

interface UserProfileProps {
  email?: string;
  role?: AdminRole;
}

export function UserProfile({ email, role }: UserProfileProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  const handleSupport = () => {
    window.open("mailto:admin@movrr.nl", "_blank");
  };

  const handleSignOut = async () => {
    startTransition(async () => {
      try {
        await signOut();
        toast({
          title: "Signed out",
          description: "You have been successfully signed out.",
        });
        setTimeout(() => router.push("/auth/signin"), 500);
      } catch (error) {
        console.error("Sign out failed:", error);
        toast({
          title: "Sign out failed",
          description: "There was an issue signing you out. Please try again.",
          variant: "destructive",
        });
      }
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <div className="flex items-center gap-3 text-sm px-3 py-2 rounded-lg hover:bg-muted cursor-pointer transition-colors">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
              <User className="h-4 w-4 text-primary" />
            </div>
            <div className="hidden lg:flex flex-col">
              <span className="font-medium text-sm truncate max-w-[120px]">
                {email}
              </span>
              <div className="scale-75 origin-left">
                {getRoleBadge(role as AdminRole)}
              </div>
            </div>
          </div>
        </div>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-56 bg-background border-border/50 rounded-xl shadow-lg"
      >
        {/* Menu Items */}
        <DropdownMenuItem
          onClick={handleSupport}
          className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer"
        >
          <LifeBuoy className="h-4 w-4 text-muted-foreground" />
          <span>Support</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={handleSignOut}
          disabled={isPending}
          className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer text-destructive focus:text-destructive"
        >
          <LogOut className="h-4 w-4" />
          <span>Sign Out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
