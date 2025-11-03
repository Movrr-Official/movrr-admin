"use client";

import React from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Rider } from "@/schemas";
import RiderDetails from "./RiderDetails";

interface RiderDrawerProps {
  rider: Rider | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
}

export function RiderDetailsDrawer({
  rider,
  open,
  onOpenChange,
  trigger,
}: RiderDrawerProps) {
  return (
    <Drawer direction="right" open={open} onOpenChange={onOpenChange}>
      {trigger && <DrawerTrigger asChild>{trigger}</DrawerTrigger>}

      <DrawerContent className="w-[420px] sm:max-w-[75rem]! p-0">
        <div className="h-full flex flex-col bg-gradient-to-b from-background/50 to-background">
          <DrawerHeader className="px-6 py-4 border-b">
            <div className="flex items-center justify-between">
              <DrawerTitle className="text-xl font-semibold">
                Rider Profile
              </DrawerTitle>
              <DrawerClose className="rounded-full h-8 w-8 flex items-center justify-center hover:bg-muted transition-colors">
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </DrawerClose>
            </div>
          </DrawerHeader>

          <div className="flex-1 overflow-auto px-6 py-4">
            <RiderDetails riderId={rider?.id} />
          </div>

          <div className="px-6 py-4 border-t flex justify-end bg-background/50 backdrop-blur-sm">
            <DrawerClose asChild>
              <Button variant="outline">Close</Button>
            </DrawerClose>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
