"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { User } from "lucide-react";

import { AdminRole } from "@/types/auth";
import { fadeInUp } from "@/lib/animations";
import { getRoleBadge } from "../UserRole";
import { useAdminUser } from "@/hooks/useAdminUser";
import useShouldHideComponent from "@/hooks/useShouldHideComponent";
import { GlobalSearch } from "../search/GlobalSearch";
import { UserProfile } from "../UserProfile";

const Navbar = () => {
  const shouldHideNavbar = useShouldHideComponent();

  const { data: adminUser } = useAdminUser();

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
        {/* Left Section - Search Bar */}
        <div className="flex-1 max-w-2xl mx-4">
          <GlobalSearch />
        </div>

        {/* Right Section - User & Actions */}
        <div className="flex items-center gap-3">
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
