"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Users,
  LayoutDashboard,
  LogOut,
  ChevronRight,
  ChevronLeft,
  List,
  Megaphone,
  Coins,
  Settings,
  KanbanSquare,
  Bell,
} from "lucide-react";
import { FaRoute } from "react-icons/fa6";
import { useAppDispatch, useAppSelector } from "@/redux/hooks";
import { toggleSidebar, setSidebarOpen } from "@/redux/slices/ui";
import { Badge } from "@/components/ui/badge";
import { JSX, useEffect, useMemo, useState, useTransition } from "react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { signOut } from "@/lib/auth";
import { CountDisplay, useCounts } from "@/providers/CountProvider";
import { UserRole } from "@/schemas";
import { useToast } from "@/hooks/useToast";
import useShouldHideComponent from "@/hooks/useShouldHideComponent";
import Image from "next/image";
import { ImSpinner8 } from "react-icons/im";

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: UserRole[];
  badge: JSX.Element | null;
}

const Sidebar = ({ currentRole }: { currentRole?: UserRole | null }) => {
  const [isMobile, setIsMobile] = useState(false);
  const [isPending, startTransition] = useTransition();
  const sidebarOpen = useAppSelector((state) => state.ui.sidebarOpen);
  const pathname = usePathname();
  const dispatch = useAppDispatch();
  const router = useRouter();
  const { toast } = useToast();

  const {
    totalWaitlist,
    totalUsers,
    totalCampaigns,
    totalRoutes,
    isLoading,
    isError,
  } = useCounts();

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };

    // Check initially
    checkMobile();

    // Add resize listener
    window.addEventListener("resize", checkMobile);

    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    localStorage.setItem("sidebarOpen", JSON.stringify(sidebarOpen));
  }, [sidebarOpen]);

  useEffect(() => {
    const stored = localStorage.getItem("sidebarOpen");
    if (stored !== null) {
      dispatch(setSidebarOpen(JSON.parse(stored)));
    }
  }, [dispatch]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024 && sidebarOpen) {
        dispatch(toggleSidebar());
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [dispatch, sidebarOpen]);

  const navigation: NavItem[] = useMemo(
    () => [
      {
        name: "Overview",
        href: "/",
        icon: LayoutDashboard,
        roles: ["admin", "super_admin"],
        badge: null,
      },
      {
        name: "Workboard",
        href: "/workboard",
        icon: KanbanSquare,
        roles: ["admin", "super_admin", "moderator"],
        badge: null,
      },
      {
        name: "Waitlist",
        href: "/waitlist",
        icon: List,
        roles: ["admin", "super_admin"],
        badge: (
          <CountDisplay
            count={totalWaitlist}
            isLoading={isLoading}
            isError={isError}
          />
        ),
      },
      {
        name: "Users",
        href: "/users",
        icon: Users,
        roles: ["admin", "super_admin"],
        badge: (
          <CountDisplay
            count={totalUsers}
            isLoading={isLoading}
            isError={isError}
          />
        ),
      },
      {
        name: "Campaigns",
        href: "/campaigns",
        icon: Megaphone,
        roles: ["admin", "super_admin"],
        badge: (
          <CountDisplay
            count={totalCampaigns}
            isLoading={isLoading}
            isError={isError}
          />
        ),
      },
      {
        name: "Routes",
        href: "/routes",
        icon: FaRoute,
        roles: ["admin", "super_admin", "moderator"],
        badge: (
          <CountDisplay
            count={totalRoutes}
            isLoading={isLoading}
            isError={isError}
          />
        ),
      },
      {
        name: "Rewards",
        href: "/rewards",
        icon: Coins,
        roles: ["admin", "super_admin"],
        badge: null,
      },
      {
        name: "Notifications",
        href: "/notifications",
        icon: Bell,
        roles: ["admin", "super_admin", "moderator", "support"],
        badge: null,
      },
      {
        name: "Settings",
        href: "/settings",
        icon: Settings,
        roles: ["admin", "super_admin"],
        badge: null,
      },
    ],
    [
      isError,
      isLoading,
      totalCampaigns,
      totalRoutes,
      totalUsers,
      totalWaitlist,
    ],
  );

  const visibleNavigation = useMemo(() => {
    if (!currentRole) return [] as NavItem[];
    return navigation.filter((item) => item.roles.includes(currentRole));
  }, [currentRole, navigation]);

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

  const sidebarWidth = sidebarOpen ? 256 : 80;

  const shouldHideSidebar = useShouldHideComponent();

  if (shouldHideSidebar) {
    return null; // Do not render Sidebar
  }

  return (
    <>
      {/* Mobile sidebar backdrop */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => dispatch(toggleSidebar())}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        initial={false}
        animate={{
          width: sidebarWidth,
          x: isMobile && !sidebarOpen ? -sidebarWidth : 0,
        }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        className={cn(
          "flex flex-col bg-background h-full z-50",
          isMobile ? "fixed" : "relative",
          "shadow-sm lg:shadow-none",
        )}
        aria-label="Main navigation"
      >
        {/* Header */}
        <div
          className={`h-16 flex items-center ${sidebarOpen ? "justify-between" : "justify-center"} p-4 border-b border-border`}
        >
          <AnimatePresence mode="wait">
            {sidebarOpen && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-2 flex-1 min-w-0"
              >
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center flex-shrink-0">
                  <Image
                    src="/movrr-icon.png"
                    alt="Movrr Icon"
                    width={24}
                    height={24}
                    sizes="(max-width: 480px) 100vw, (max-width: 768px) 50vw, 100vw"
                    quality={100}
                    priority
                    aria-hidden="true"
                  />
                </div>
                <div className="flex flex-col min-w-0">
                  <h2 className="text-lg uppercase font-semibold truncate">
                    Movrr
                  </h2>
                  <span className="text-xs text-muted-foreground truncate">
                    Admin Portal
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => dispatch(toggleSidebar())}
            className="hover:bg-muted hover:text-black p-1"
            aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            {sidebarOpen ? (
              <ChevronLeft className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </Button>
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1 px-3 py-4">
          <nav className="space-y-2">
            {visibleNavigation.map((item, idx) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;

              return (
                <Link
                  key={idx}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 h-9 px-4 py-2 rounded-md text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted",
                    !sidebarOpen && "justify-center",
                  )}
                  aria-current={isActive ? "page" : undefined}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
                  <AnimatePresence mode="wait">
                    {sidebarOpen && (
                      <motion.span
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: "auto" }}
                        exit={{ opacity: 0, width: 0 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        className="flex items-center justify-between flex-1 min-w-0"
                      >
                        <span className="truncate">{item.name}</span>
                        {item.badge && (
                          <Badge
                            variant={isActive ? "secondary" : "outline"}
                            className="ml-2 text-xs font-medium flex-shrink-0"
                          >
                            {item.badge}
                          </Badge>
                        )}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </Link>
              );
            })}
          </nav>
        </ScrollArea>

        {/* Footer */}
        <div className="p-3 border-t border-border">
          <Button
            variant="ghost"
            onClick={handleSignOut}
            disabled={isPending}
            className={cn(
              "w-full justify-start gap-3 text-red-600 hover:text-red-700 hover:bg-red-50 cursor-pointer",
              !sidebarOpen && "justify-center",
            )}
            aria-busy={isPending}
          >
            <LogOut className="h-5 w-5 flex-shrink-0" aria-hidden="true" />

            <AnimatePresence mode="wait">
              {sidebarOpen && (
                <motion.span
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                >
                  {isPending ? (
                    <span className="flex items-center justify-center gap-2">
                      <ImSpinner8 className="animate-spin h-4 w-4" />
                      Signing Out...
                    </span>
                  ) : (
                    "Sign Out"
                  )}
                </motion.span>
              )}
            </AnimatePresence>
          </Button>
        </div>
      </motion.aside>
    </>
  );
};

export default Sidebar;
