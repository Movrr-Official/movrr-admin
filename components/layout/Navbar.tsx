"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import { fadeInUp } from "@/lib/animations";
import { useAdminUser } from "@/hooks/useAdminUser";
import { GlobalSearch } from "../search/GlobalSearch";
import { toggleSidebar } from "@/redux/slices/ui";
import { useAppDispatch } from "@/redux/hooks";
import { UserProfile } from "../UserProfile";
import useShouldHideComponent from "@/hooks/useShouldHideComponent";

const Navbar = () => {
  const shouldHideNavbar = useShouldHideComponent();
  const { data: adminUser } = useAdminUser();
  const dispatch = useAppDispatch();

  if (shouldHideNavbar) {
    return null;
  }

  return (
    <>
      <motion.header
        variants={fadeInUp}
        initial="initial"
        animate="animate"
        className="h-16 flex items-center justify-between px-4 sm:px-6 lg:px-8"
      >
        {/* Left Section - Movrr Icon & Search Bar */}
        <div className="flex items-center gap-4 flex-1 max-w-2xl">
          {/* Movrr Icon - Hidden on desktop, visible on mobile */}
          <div className="lg:hidden flex items-center gap-2">
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
            <div className="flex flex-col">
              <h2 className="text-lg uppercase font-semibold leading-none">
                Movrr
              </h2>
              <span className="text-xs text-muted-foreground leading-none">
                Admin Portal
              </span>
            </div>
          </div>

          {/* Search Bar */}
          <div className="flex-1">
            <GlobalSearch />
          </div>
        </div>

        {/* Right Section - User & Actions */}
        <div className="flex items-center gap-3">
          {/* Menu Button - Visible only on mobile */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => dispatch(toggleSidebar())}
            className="lg:hidden p-2 hover:bg-muted"
            aria-label="Toggle sidebar"
          >
            <Menu className="h-5 w-5" />
          </Button>

          {/* User Profile - Desktop */}
          <div className="hidden sm:flex items-center gap-3">
            <UserProfile email={adminUser?.email} role={adminUser?.role} />
          </div>
        </div>
      </motion.header>
    </>
  );
};

export default Navbar;
