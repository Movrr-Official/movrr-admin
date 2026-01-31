"use client";

import React from "react";

import { FilterConfig } from "@/lib/applyFilters";
import { DataTableContainer } from "@/context/DataTableContext";
import { User } from "@/schemas";
import UsersTableContent from "./UsersTableContent";

interface UsersTableProps {
  users: User[];
  isLoading: boolean;
  toolbar?: boolean;
  searchBar?: boolean;
  className?: string;
  refetchData?: () => void;
  isRefetching?: boolean;
}

export function UsersTable({
  users,
  isLoading,
  toolbar = true,
  searchBar = true,
  className,
  refetchData,
  isRefetching = false,
}: UsersTableProps) {
  const filterConfig: FilterConfig[] = [
    {
      id: "role",
      label: "Role",
      type: "multi-select",
      key: "role",
      options: [
        { value: "rider", label: "Rider" },
        { value: "advertiser", label: "Advertiser" },
        { value: "admin", label: "Admin" },
        { value: "super-admin", label: "Super Admin" },
        { value: "moderator", label: "Moderator" },
        { value: "support", label: "Support" },
      ],
    },
    {
      id: "status",
      label: "Status",
      type: "multi-select",
      key: "status",
      options: [
        { value: "active", label: "Active" },
        { value: "inactive", label: "Inactive" },
        { value: "pending", label: "Pending" },
      ],
    },
  ];

  return (
    <DataTableContainer
      data={users}
      filterConfig={filterConfig}
      persistToUrl={true}
      debounceMs={500}
    >
      <UsersTableContent
        isLoading={isLoading}
        toolbar={toolbar}
        searchBar={searchBar}
        className={className}
        refetchData={refetchData}
        isRefetching={isRefetching}
      />
    </DataTableContainer>
  );
}
