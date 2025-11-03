"use client";

import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import { columns } from "./RiderTableColumns";
import { DataTable } from "@/components/table/DataTable";
import { RootState } from "@/redux/store";
import { Rider } from "@/schemas";
import { RiderDetailsDrawer } from "./RiderDetailsDrawer";
import { setSearchValue } from "@/redux/slices/usersFilter";
import { DataTableSkeleton } from "../skeletons/DataTableSkeleton";
import { RidersSkeleton } from "../skeletons/RidersSkeleton";

interface RiderTableProps {
  riders: Rider[];
  isLoading: boolean;
}

export function RiderTable({ riders, isLoading }: RiderTableProps) {
  const { searchValue, statusFilter } = useSelector(
    (state: RootState) => state.usersFilter
  );

  const [selectedRider, setSelectedRider] = useState<Rider | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const dispatch = useDispatch();

  const handleViewRider = (rider: Rider) => {
    setSelectedRider(rider);
    setDrawerOpen(true);
  };

  return (
    <>
      {isLoading ? (
        <RidersSkeleton />
      ) : (
        <DataTable
          columns={columns}
          data={riders || []}
          searchValue={searchValue}
          onSearchChange={(value) => dispatch(setSearchValue(value))}
          searchKey="name"
          onRowClick={handleViewRider}
          filterOptions={{
            status: statusFilter === "all" ? [] : [statusFilter],
          }}
        />
      )}
      <RiderDetailsDrawer
        rider={selectedRider}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />
    </>
  );
}
