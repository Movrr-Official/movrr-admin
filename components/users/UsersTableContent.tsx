"use client";

import React, { useState } from "react";
import { useSearchParams } from "next/navigation";

import { ActiveFiltersDisplay } from "../filters/ActiveFiltersDisplay";
import { getUsersTableColumns } from "./UsersTableColumns";
import { DataTable } from "@/components/table/DataTable";
import { DataTableSkeleton } from "../skeletons/DataTableSkeleton";
import { DataTableToolbar } from "@/components/table/DataTableToolbar";
import { FilterSummary } from "../filters/FilterSummary";
import { User } from "@/schemas";
import { useDataTable } from "@/context/DataTableContext";
import { useToast } from "@/hooks/useToast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { deleteUser } from "@/app/actions/users";
import { UserDetailsDrawer } from "@/components/users/UserDetailsDrawer";
import { BulkActions, BulkAction } from "@/components/filters/BulkActions";
import { Users, UserCheck, UserX, Download, Plus } from "lucide-react";

interface UsersTableContentProps {
  isLoading: boolean;
  toolbar?: boolean;
  searchBar?: boolean;
  className?: string;
  refetchData?: () => void;
  isRefetching?: boolean;
}

export default function UsersTableContent({
  isLoading,
  toolbar = true,
  searchBar = true,
  className,
  refetchData,
  isRefetching = false,
}: UsersTableContentProps) {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedRows, setSelectedRows] = useState<User[]>([]);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const {
    data: users,
    filteredData,
    filters: activeFilters,
    clearFilter,
    clearAllFilters,
    isLoading: filtersLoading,
    activeFilterCount,
    filterConfig,
  } = useDataTable();

  // Handle user row click - open detail drawer
  const handleRowClick = (user: User) => {
    setSelectedUser(user);
    setIsDrawerOpen(true);
  };

  // Handle user actions
  const handleEdit = (user: User) => {
    setSelectedUser(user);
    setIsDrawerOpen(true);
  };

  const handleStatusChange = async (user: User) => {
    const newStatus = user.status === "active" ? "inactive" : "active";
    try {
      const { toggleUserStatus } = await import("@/app/actions/users");
      const result = await toggleUserStatus({
        userId: user.id,
        status: newStatus,
      });

      if (!result.success) {
        throw new Error(result.error || "Failed to update user status");
      }

      toast({
        title: "Status Updated",
        description: `${user.name} status changed to ${newStatus}.`,
      });
      refetchData?.();
    } catch (error) {
      toast({
        title: "Update Failed",
        description:
          error instanceof Error
            ? error.message
            : "Failed to update user status. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleRoleChange = (user: User) => {
    // Role change is handled in the UserDetailsDrawer
    setSelectedUser(user);
    setIsDrawerOpen(true);
  };

  const handleResetPassword = (user: User) => {
    // Reset password is handled in the UserDetailsDrawer
    setSelectedUser(user);
    setIsDrawerOpen(true);
  };

  const handleExportData = async (user: User) => {
    try {
      const { exportUserData } = await import("@/app/actions/users");
      const { exportToJSON } = await import("@/lib/export");

      toast({
        title: "Exporting Data",
        description: `Preparing data export for ${user.name}...`,
      });

      const result = await exportUserData(user.id);

      if (!result.success || !result.data) {
        throw new Error(result.error || "Failed to export user data");
      }

      // Export as JSON file
      exportToJSON([result.data], {
        filename: `user_data_${user.id}_${new Date().toISOString().split("T")[0]}`,
        format: "json",
      });

      toast({
        title: "Export Complete",
        description: `User data for ${user.name} has been exported successfully.`,
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description:
          error instanceof Error
            ? error.message
            : "Failed to export user data. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDelete = (user: User) => {
    setUserToDelete(user);
  };

  const confirmDelete = async () => {
    if (!userToDelete) return;
    setIsDeleting(true);

    const result = await deleteUser({ userId: userToDelete.id });
    setIsDeleting(false);

    if (!result.success) {
      toast({
        title: "Delete Failed",
        description: result.error || "Failed to delete user.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "User Deleted",
      description: `${userToDelete.name} has been deleted successfully.`,
    });
    setUserToDelete(null);
    refetchData?.();
  };

  const columns = React.useMemo(
    () =>
      getUsersTableColumns({
        onEdit: handleEdit,
        onStatusChange: handleStatusChange,
        onRoleChange: handleRoleChange,
        onResetPassword: handleResetPassword,
        onExportData: handleExportData,
        onDelete: handleDelete,
      }),
    [],
  );

  // Bulk actions configuration
  const bulkActions: BulkAction[] = React.useMemo(
    () => [
      {
        label: "Activate",
        icon: UserCheck,
        onClick: async (selectedRows: User[]) => {
          const { bulkUpdateUserStatus } = await import("@/app/actions/users");
          const userIds = selectedRows.map((u) => u.id);
          const result = await bulkUpdateUserStatus(userIds, "active");
          if (!result.success) {
            throw new Error(result.error || "Failed to activate users");
          }
          toast({
            title: "Users Activated",
            description: `${result.updatedCount || selectedRows.length} user(s) have been activated.`,
          });
        },
        confirmation: {
          title: "Activate Users",
          description: (count) =>
            `Are you sure you want to activate ${count} selected user(s)? This will change their status to active.`,
        },
      },
      {
        label: "Suspend",
        icon: UserX,
        variant: "destructive",
        onClick: async (selectedRows: User[]) => {
          const { bulkUpdateUserStatus } = await import("@/app/actions/users");
          const userIds = selectedRows.map((u) => u.id);
          const result = await bulkUpdateUserStatus(userIds, "inactive");
          if (!result.success) {
            throw new Error(result.error || "Failed to suspend users");
          }
          toast({
            title: "Users Suspended",
            description: `${result.updatedCount || selectedRows.length} user(s) have been suspended.`,
          });
        },
        confirmation: {
          title: "Suspend Users",
          description: (count) =>
            `Are you sure you want to suspend ${count} selected user(s)? This will change their status to inactive.`,
        },
      },
      {
        label: "Export",
        icon: Download,
        onClick: async (selectedRows: User[]) => {
          const { exportUserData } = await import("@/app/actions/users");
          const { exportToJSON } = await import("@/lib/export");

          toast({
            title: "Exporting Data",
            description: `Preparing data export for ${selectedRows.length} user(s)...`,
          });

          const exportPromises = selectedRows.map((user) =>
            exportUserData(user.id),
          );
          const results = await Promise.all(exportPromises);

          const successfulExports = results
            .filter((r) => r.success && r.data)
            .map((r) => r.data);

          if (successfulExports.length === 0) {
            throw new Error("Failed to export user data");
          }

          exportToJSON(successfulExports, {
            filename: `bulk_user_export_${new Date().toISOString().split("T")[0]}`,
            format: "json",
          });

          toast({
            title: "Export Complete",
            description: `Data for ${successfulExports.length} user(s) has been exported successfully.`,
          });
        },
        confirmation: {
          title: "Export User Data",
          description: (count) =>
            `This will export all data for ${count} selected user(s) in GDPR-compliant format. The export will include profile information, routes, campaigns, rewards, and activity logs.`,
        },
      },
    ],
    [toast],
  );

  if (isLoading) {
    return <DataTableSkeleton className={className} />;
  }

  return (
    <>
      <div className="space-y-4">
        {/* Toolbar */}
        {toolbar && (
          <DataTableToolbar
            search={{
              enabled: true,
              placeholder: "Search users by name, email, or ID...",
              paramKey: "search",
            }}
            export={{
              enabled: true,
              data: filteredData,
              filename: "users_export",
              formats: ["csv", "xlsx", "json"],
            }}
            additionalActionsRight={{
              enabled: true,
              path: "/users/create",
              label: "Create User",
              icon: Plus,
            }}
            refresh={{
              enabled: true,
              onRefresh: refetchData,
              isLoading: isRefetching,
            }}
          />
        )}

        {/* Active Filters */}
        {activeFilterCount > 0 && (
          <div className="flex flex-col gap-2">
            <ActiveFiltersDisplay
              activeFilters={activeFilters}
              filterConfig={filterConfig}
              clearFilter={clearFilter}
              clearAllFilters={clearAllFilters}
            />
            <FilterSummary
              filteredDataLength={filteredData.length}
              totalDataLength={users.length}
              activeFilterCount={activeFilterCount}
            />
          </div>
        )}

        {/* Bulk Actions - shown above table when rows are selected */}
        <BulkActions
          selectedRows={selectedRows}
          actions={bulkActions}
          entityName="user"
          onSuccess={refetchData}
        />

        {/* Data Table */}
        <DataTable
          columns={columns}
          data={filteredData}
          searchKey="search"
          searchFields={["name", "email", "id"]}
          searchParamKey="search"
          title="Users"
          description="All users ({count} total)"
          emptyStateTitle="No Users Found"
          emptyStateDescription="No users match your search criteria. Try adjusting your filters or search terms."
          emptyStateIcon={Users}
          className={className}
          onRowClick={handleRowClick}
          enableRowSelection={true}
          onSelectionChange={setSelectedRows}
          searchBar={searchBar}
        />
      </div>

      {/* User Details Drawer */}
      <UserDetailsDrawer
        user={selectedUser}
        open={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
        onUserUpdate={refetchData}
      />

      <AlertDialog
        open={Boolean(userToDelete)}
        onOpenChange={(open) => {
          if (!open) setUserToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user</AlertDialogTitle>
            <AlertDialogDescription>
              This action permanently deletes the user and related rider data.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete user"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
