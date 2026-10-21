"use client";

import React from "react";
import { ACCOUNT_DOMAINS, rolesForDomain, accountRoleLabel } from "@/features/identity/domain/accountDomains";

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
  const tableUsers = React.useMemo(() => users.map(user => ({ ...user,
    domains: user.domains?.length ? user.domains : ["user"],
    scopedRoles: [...(user.domains?.includes("rider") ? ["rider:rider"] : []), ...(user.employeeRole ? [`staff:${user.employeeRole}`] : []), ...(user.memberships ?? []).filter(member => member.status !== "revoked").map(member => `${member.domain}:${member.role}`)],
    membershipSearch: (user.memberships ?? []).map(member => `${member.domain} ${member.organisationName} ${member.role} ${member.status}`).join(" "),
  })), [users]);
  const filterConfig: FilterConfig[] = [
    { id: "domains", label: "Relationships", type: "multi-select", key: "domains", primary: true,
      options: [{ value: "user", label: "User only" }, ...ACCOUNT_DOMAINS.map(domain => ({ value: domain, label: domain === "staff" ? "MOVRR Staff" : accountRoleLabel(domain, domain) }))] },
    {
      id: "scopedRoles",
      label: "Scoped role",
      type: "multi-select",
      key: "scopedRoles",
      primary: true,
      options: ACCOUNT_DOMAINS.flatMap(domain => rolesForDomain(domain).map(role => ({ value: `${domain}:${role}`, label: `${domain === "staff" ? "MOVRR Staff" : accountRoleLabel(domain, domain)}: ${accountRoleLabel(domain, role)}` }))),
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
      data={tableUsers}
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
