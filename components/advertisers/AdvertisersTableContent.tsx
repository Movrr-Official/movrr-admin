"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Building2, Plus } from "lucide-react";

import { Advertiser } from "@/schemas";
import { useDataTable } from "@/context/DataTableContext";
import { DataTable } from "@/components/table/DataTable";
import { DataTableSkeleton } from "@/components/skeletons/DataTableSkeleton";
import { DataTableToolbar } from "@/components/table/DataTableToolbar";
import { useDrawerQueryId } from "@/hooks/useDrawerQueryId";
import { AdvertiserDetailsDrawer } from "./AdvertiserDetailsDrawer";
import { getAdvertisersTableColumns } from "./AdvertisersTableColumns";

interface AdvertisersTableContentProps {
  isLoading: boolean;
  toolbar?: boolean;
  searchBar?: boolean;
  className?: string;
  refetchData?: () => void;
  isRefetching?: boolean;
}

export default function AdvertisersTableContent({
  isLoading,
  toolbar = true,
  searchBar = false,
  className,
  refetchData,
  isRefetching = false,
}: AdvertisersTableContentProps) {
  const { selectedId, setSelectedId } = useDrawerQueryId();
  const [selectedAdvertiser, setSelectedAdvertiser] = useState<Advertiser | null>(
    null,
  );
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const {
    data: advertisers,
    filteredData,
  } = useDataTable();

  useEffect(() => {
    if (!selectedId) {
      if (isDrawerOpen) {
        setIsDrawerOpen(false);
        setSelectedAdvertiser(null);
      }
      return;
    }
    const found =
      advertisers.find((item) => item.id === selectedId) ?? null;
    setSelectedAdvertiser(found);
    setIsDrawerOpen(true);
  }, [selectedId, advertisers]);

  useEffect(() => {
    if (!selectedAdvertiser || !isDrawerOpen) return;

    const latestAdvertiser = advertisers.find(
      (item) => item.id === selectedAdvertiser.id,
    );
    if (!latestAdvertiser) {
      setIsDrawerOpen(false);
      setSelectedAdvertiser(null);
      setSelectedId(null);
      return;
    }

    const hasChanged =
      latestAdvertiser.updatedAt !== selectedAdvertiser.updatedAt ||
      latestAdvertiser.status !== selectedAdvertiser.status ||
      latestAdvertiser.companyName !== selectedAdvertiser.companyName ||
      latestAdvertiser.email !== selectedAdvertiser.email ||
      latestAdvertiser.phone !== selectedAdvertiser.phone ||
      latestAdvertiser.totalCampaigns !== selectedAdvertiser.totalCampaigns;

    if (hasChanged) {
      setSelectedAdvertiser(latestAdvertiser);
    }
  }, [advertisers, selectedAdvertiser, isDrawerOpen, setSelectedId]);

  const openAdvertiserDrawer = (advertiser: Advertiser) => {
    setSelectedAdvertiser(advertiser);
    setIsDrawerOpen(true);
    setSelectedId(advertiser.id);
  };

  const handleRowClick = (advertiser: Advertiser) => {
    openAdvertiserDrawer(advertiser);
  };

  const columns = useMemo(
    () =>
      getAdvertisersTableColumns({
        onView: openAdvertiserDrawer,
        onEdit: openAdvertiserDrawer,
        onDelete: openAdvertiserDrawer,
      }),
    [],
  );

  if (isLoading) {
    return <DataTableSkeleton className={className} />;
  }

  return (
    <>
      <div className="space-y-4">
        {toolbar && (
          <DataTableToolbar
            search={{
              enabled: true,
              placeholder: "Search advertisers by company, contact, or email...",
              paramKey: "search",
            }}
            export={{
              enabled: true,
              data: filteredData,
              filename: "advertisers_export",
              formats: ["csv", "xlsx", "json"],
            }}
            additionalActionsRight={{
              enabled: true,
              label: "Add Advertiser",
              icon: Plus,
              path: "/advertisers/create",
            }}
            refresh={{
              enabled: true,
              onRefresh: refetchData,
              isLoading: isRefetching,
            }}
          />
        )}

        <DataTable
          columns={columns}
          data={filteredData}
          searchKey="search"
          searchFields={["companyName", "contactName", "email"]}
          searchParamKey="search"
          title="Advertisers"
          description={`All advertiser profiles (${advertisers.length} total)`}
          emptyStateTitle="No Advertisers Found"
          emptyStateDescription="No advertiser profiles match your current filters."
          emptyStateIcon={Building2}
          className={className}
          onRowClick={handleRowClick}
          searchBar={searchBar}
        />
      </div>

      <AdvertiserDetailsDrawer
        advertiser={selectedAdvertiser}
        open={isDrawerOpen}
        onOpenChange={(open) => {
          setIsDrawerOpen(open);
          if (!open) {
            setSelectedAdvertiser(null);
            setSelectedId(null);
          }
        }}
        onAdvertiserUpdate={refetchData}
      />
    </>
  );
}
