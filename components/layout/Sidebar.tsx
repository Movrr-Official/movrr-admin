"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
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
  Building2,
  Bike,
  Timer,
  CalendarClock,
  Lightbulb,
  Route,
  Package,
  Shield,
  AlertTriangle,
  Landmark,
  Clock3,
  Activity,
  CreditCard,
} from "lucide-react";
import { FaRoute } from "react-icons/fa6";
import { useAppDispatch, useAppSelector } from "@/redux/hooks";
import { toggleSidebar, setSidebarOpen } from "@/redux/slices/ui";
import { Badge } from "@/components/ui/badge";
import { Fragment, JSX, useEffect, useMemo, useState, useTransition } from "react";

import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { signOut } from "@/lib/auth";
import { ADMIN_USER_QUERY_KEY } from "@/hooks/useAdminUser";
import { CountDisplay, useCounts } from "@/providers/CountProvider";
import { UserRole } from "@/schemas";
import { useToast } from "@/hooks/useToast";
import useShouldHideComponent from "@/hooks/useShouldHideComponent";
import Image from "next/image";
import { ImSpinner8 } from "react-icons/im";

const STAFF_READ_ROLES: UserRole[] = [
  "admin",
  "super_admin",
  "moderator",
  "support",
  "compliance_officer",
  "government",
];

const OPS_WRITE_ROLES: UserRole[] = ["admin", "super_admin"];

const MODERATOR_ROLES: UserRole[] = ["admin", "super_admin", "moderator"];

interface NavItem {
  type?: "item";
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: UserRole[];
  badge: JSX.Element | null;
}

interface NavSection {
  type: "section";
  name: string;
  roles: UserRole[];
}

type NavEntry = NavItem | NavSection;

const isNavSection = (entry: NavEntry): entry is NavSection =>
  entry.type === "section";

const Sidebar = ({ currentRole }: { currentRole?: UserRole | null }) => {
  const [isMobile, setIsMobile] = useState(false);
  const [isPending, startTransition] = useTransition();
  const sidebarOpen = useAppSelector((state) => state.ui.sidebarOpen);
  const pathname = usePathname();
  const dispatch = useAppDispatch();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const {
    totalWaitlist,
    totalUsers,
    totalRiders,
    totalAdvertisers,
    totalCampaigns,
    totalPlannedRoutes,
    totalCommunityRides,
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

  const PROGRAMMES_READ_ROLES: UserRole[] = [
    ...OPS_WRITE_ROLES,
    "compliance_officer",
    "government",
  ];

  const navigation: NavEntry[] = useMemo(
    () => [
      {
        type: "item",
        name: "Overview",
        href: "/",
        icon: LayoutDashboard,
        roles: STAFF_READ_ROLES,
        badge: null,
      },
      {
        type: "item",
        name: "Workboard",
        href: "/workboard",
        icon: KanbanSquare,
        roles: MODERATOR_ROLES,
        badge: null,
      },
      {
        type: "item",
        name: "Fraud",
        href: "/fraud",
        icon: Shield,
        roles: OPS_WRITE_ROLES,
        badge: null,
      },
      {
        type: "item",
        name: "Incidents",
        href: "/incidents",
        icon: AlertTriangle,
        roles: OPS_WRITE_ROLES,
        badge: null,
      },
      {
        type: "item",
        name: "Programmes",
        href: "/programmes",
        icon: Landmark,
        roles: PROGRAMMES_READ_ROLES,
        badge: null,
      },
      {
        type: "item",
        name: "Waitlist",
        href: "/waitlist",
        icon: List,
        roles: OPS_WRITE_ROLES,
        badge: (
          <CountDisplay
            count={totalWaitlist}
            isLoading={isLoading}
            isError={isError}
          />
        ),
      },
      {
        type: "item",
        name: "Users",
        href: "/users",
        icon: Users,
        roles: OPS_WRITE_ROLES,
        badge: (
          <CountDisplay
            count={totalUsers}
            isLoading={isLoading}
            isError={isError}
          />
        ),
      },
      {
        type: "item",
        name: "Riders",
        href: "/riders",
        icon: Bike,
        roles: [...OPS_WRITE_ROLES, "compliance_officer", "government"],
        badge: (
          <CountDisplay
            count={totalRiders}
            isLoading={isLoading}
            isError={isError}
          />
        ),
      },
      {
        type: "item",
        name: "Ride Sessions",
        href: "/ride-sessions",
        icon: Timer,
        roles: [...OPS_WRITE_ROLES, "compliance_officer", "government"],
        badge: null,
      },
      {
        type: "item",
        name: "Suggested Routes",
        href: "/suggested-routes",
        icon: Route,
        roles: MODERATOR_ROLES,
        badge: null,
      },
      {
        type: "item",
        name: "Rewards",
        href: "/rewards",
        icon: Coins,
        roles: [...OPS_WRITE_ROLES, "compliance_officer"],
        badge: null,
      },
      {
        type: "item",
        name: "Fulfilment",
        href: "/fulfilment",
        icon: Package,
        roles: [...OPS_WRITE_ROLES, "compliance_officer"],
        badge: null,
      },
      {
        type: "item",
        name: "Advertisers",
        href: "/advertisers",
        icon: Building2,
        roles: [...OPS_WRITE_ROLES, "compliance_officer"],
        badge: (
          <CountDisplay
            count={totalAdvertisers}
            isLoading={isLoading}
            isError={isError}
          />
        ),
      },
      {
        type: "item",
        name: "Campaigns",
        href: "/campaigns",
        icon: Megaphone,
        roles: [...OPS_WRITE_ROLES, "compliance_officer", "government"],
        badge: (
          <CountDisplay
            count={totalCampaigns}
            isLoading={isLoading}
            isError={isError}
          />
        ),
      },
      {
        type: "item",
        name: "Planned Routes",
        href: "/routes",
        icon: FaRoute,
        roles: MODERATOR_ROLES,
        badge: (
          <CountDisplay
            count={totalPlannedRoutes}
            isLoading={isLoading}
            isError={isError}
          />
        ),
      },
      {
        type: "item",
        name: "Community Rides",
        href: "/community-rides",
        icon: CalendarClock,
        roles: [...OPS_WRITE_ROLES, "compliance_officer", "government"],
        badge: (
          <CountDisplay
            count={totalCommunityRides}
            isLoading={isLoading}
            isError={isError}
          />
        ),
      },
      {
        type: "item",
        name: "Pro Tips",
        href: "/pro-tips",
        icon: Lightbulb,
        roles: OPS_WRITE_ROLES,
        badge: null,
      },
      {
        type: "item",
        name: "Notifications",
        href: "/notifications",
        icon: Bell,
        roles: STAFF_READ_ROLES,
        badge: null,
      },
      {
        type: "section",
        name: "Ops",
        roles: OPS_WRITE_ROLES,
      },
      {
        type: "item",
        name: "Jobs",
        href: "/ops/jobs",
        icon: Clock3,
        roles: OPS_WRITE_ROLES,
        badge: null,
      },
      {
        type: "item",
        name: "Health",
        href: "/ops/health",
        icon: Activity,
        roles: OPS_WRITE_ROLES,
        badge: null,
      },
      {
        type: "item",
        name: "Billing",
        href: "/ops/billing",
        icon: CreditCard,
        roles: OPS_WRITE_ROLES,
        badge: null,
      },
      {
        type: "item",
        name: "Settings",
        href: "/settings",
        icon: Settings,
        roles: OPS_WRITE_ROLES,
        badge: null,
      },
    ],
    [
      isError,
      isLoading,
      totalCampaigns,
      totalAdvertisers,
      totalRiders,
      totalPlannedRoutes,
      totalUsers,
      totalWaitlist,
      totalCommunityRides,
    ],
  );

  const visibleNavigation = useMemo(() => {
    if (!currentRole) return [] as NavEntry[];
    return navigation.filter((entry) => entry.roles.includes(currentRole));
  }, [currentRole, navigation]);

  const handleSignOut = async () => {
    startTransition(async () => {
      try {
        await signOut();
        queryClient.setQueryData(ADMIN_USER_QUERY_KEY, null);
        queryClient.removeQueries({
          queryKey: ADMIN_USER_QUERY_KEY,
          exact: true,
        });
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
          "flex h-full flex-col border-r border-border bg-background z-50",
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
                <div className="w-8 h-8 bg-movrr-bg-primary rounded-[10px] flex items-center justify-center flex-shrink-0">
                  <Image
                    src="/movrr-icon-mark.png"
                    alt="MOVRR Icon"
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
                    MOVRR
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
            className="hover:bg-muted hover:text-foreground p-1"
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
          <TooltipProvider delayDuration={0}>
            <nav className="space-y-2">
              {visibleNavigation.map((entry, idx) => {
                if (isNavSection(entry)) {
                  if (!sidebarOpen) return null;
                  return (
                    <p
                      key={`section-${entry.name}-${idx}`}
                      className="px-4 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      {entry.name}
                    </p>
                  );
                }

                const item = entry;
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname === item.href ||
                      pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;
                const showCollapsedTooltip = !sidebarOpen && !isMobile;

                const link = (
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 h-9 px-4 py-2 rounded-md text-sm font-medium transition-colors",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted",
                      !sidebarOpen && "justify-center",
                    )}
                    aria-current={isActive ? "page" : undefined}
                    aria-label={showCollapsedTooltip ? item.name : undefined}
                  >
                    <Icon
                      className="w-5 h-5 flex-shrink-0"
                      aria-hidden="true"
                    />
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

                return showCollapsedTooltip ? (
                  <Tooltip key={idx}>
                    <TooltipTrigger asChild>{link}</TooltipTrigger>
                    <TooltipContent side="right" align="center" sideOffset={8}>
                      {item.name}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <Fragment key={idx}>{link}</Fragment>
                );
              })}
            </nav>
          </TooltipProvider>
        </ScrollArea>

        {/* Footer */}
        <div className="flex h-16 shrink-0 items-center border-t border-border px-3">
          {!sidebarOpen && !isMobile ? (
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    onClick={handleSignOut}
                    disabled={isPending}
                    className={cn(
                      "w-full justify-start gap-3 text-destructive hover:text-destructive hover:bg-destructive/10 cursor-pointer",
                      !sidebarOpen && "justify-center",
                    )}
                    aria-busy={isPending}
                    aria-label="Sign Out"
                  >
                    <LogOut
                      className="h-5 w-5 flex-shrink-0"
                      aria-hidden="true"
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right" align="center" sideOffset={8}>
                  Sign Out
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <Button
              variant="ghost"
              onClick={handleSignOut}
              disabled={isPending}
              className={cn(
                "w-full justify-start gap-3 text-destructive hover:text-destructive hover:bg-destructive/10 cursor-pointer",
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
          )}
        </div>
      </motion.aside>
    </>
  );
};

export default Sidebar;
