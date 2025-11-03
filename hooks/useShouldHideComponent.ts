"use client";

import { usePathname } from "next/navigation";

import { paths } from "@/constant/path";

const useShouldHideComponent = () => {
  // Get the current route
  const pathname = usePathname();

  // Check if the current pathname matches any of the paths to hide the component
  return paths.some((path) => pathname.startsWith(path));
};

export default useShouldHideComponent;
