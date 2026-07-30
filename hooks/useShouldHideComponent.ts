"use client";

import { usePathname } from "next/navigation";

import { paths } from "@/constant/path";
import { matchesAnyPathPrefix } from "@/lib/pathMatch";

const useShouldHideComponent = () => {
  const pathname = usePathname();
  return matchesAnyPathPrefix(pathname, paths);
};

export default useShouldHideComponent;
