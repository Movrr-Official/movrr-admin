"use client";

import React from "react";
import { EMPLOYEE_ROLE_OPTIONS, PRODUCT_ROLE_OPTIONS } from "@/features/authorization/roleOptions";

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
      primary: true,
      options: [...PRODUCT_ROLE_OPTIONS, ...EMPLOYEE_ROLE_OPTIONS, { value: "unassigned", label: "No employee access" }],
    },
    {
      id: "status",
      label: "Status",
      type: "multi-select",
      key: "status",
      primary: true,
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
