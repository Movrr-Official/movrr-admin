"use client";

import React from "react";
import {
  Calendar,
  Coins,
  Edit,
  Megaphone,
  Route,
  TrendingDown,
  TrendingUp,
  User,
  X,
} from "lucide-react";
import { format } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { CopyButton } from "@/components/CopyButton";
import { RewardTransaction } from "@/schemas";

interface RiderTransactionsDetailsDrawerProps {
  transaction: RewardTransaction | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const getTransactionTypeBadge = (type: RewardTransaction["type"]) => {
  switch (type) {
    case "awarded":
      return (
        <Badge className="bg-green-50 text-green-700 border-green-200 font-medium dark:bg-green-950 dark:text-green-300">
          <TrendingUp className="h-3 w-3 mr-1" />
          Awarded
        </Badge>
      );
    case "redeemed":
      return (
        <Badge className="bg-blue-50 text-blue-700 border-blue-200 font-medium dark:bg-blue-950 dark:text-blue-300">
          <TrendingDown className="h-3 w-3 mr-1" />
          Redeemed
        </Badge>
      );
    case "adjusted":
      return (
        <Badge className="bg-amber-50 text-amber-700 border-amber-200 font-medium dark:bg-amber-950 dark:text-amber-300">
          <Edit className="h-3 w-3 mr-1" />
          Adjusted
        </Badge>
      );
    default:
      return <Badge variant="secondary">{type}</Badge>;
  }
};

export function RiderTransactionsDetailsDrawer({
  transaction,
  open,
  onOpenChange,
}: RiderTransactionsDetailsDrawerProps) {
  if (!transaction) return null;

  const isPositive = transaction.points > 0;
  const formattedDate = (() => {
    try {
      return format(new Date(transaction.createdAt), "MMM d, yyyy HH:mm");
    } catch {
      return transaction.createdAt;
    }
  })();

  return (
    <Drawer direction="right" open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="glass-card border-0 backdrop-blur-xl h-full w-full sm:w-[360px] lg:max-w-[60rem]! p-0">
        <DrawerHeader className="border-b border-border/50">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <DrawerTitle className="text-2xl font-bold mb-2">
                Transaction Details
              </DrawerTitle>
              <div className="flex flex-wrap items-center gap-2">
                {getTransactionTypeBadge(transaction.type)}
                <Badge variant="outline" className="font-medium">
                  <Calendar className="h-3 w-3 mr-1" />
                  {formattedDate}
                </Badge>
              </div>
            </div>
            <DrawerClose asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <X className="h-4 w-4" />
              </Button>
            </DrawerClose>
          </div>
        </DrawerHeader>

        <div className="overflow-y-auto flex-1 p-6 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="glass-card border-0">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Coins className="h-5 w-5" />
                  Transaction Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Transaction ID
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono">{transaction.id}</span>
                    <CopyButton value={transaction.id} />
                  </div>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Points</span>
                  <div className="flex items-center gap-2">
                    {isPositive ? (
                      <TrendingUp className="h-4 w-4 text-green-600" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-red-600" />
                    )}
                    <span
                      className={`text-sm font-semibold ${
                        isPositive ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {isPositive ? "+" : ""}
                      {transaction.points.toLocaleString()}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Balance After
                  </span>
                  <div className="flex items-center gap-2">
                    <Coins className="h-4 w-4 text-amber-600" />
                    <span className="text-sm font-semibold">
                      {transaction.balanceAfter.toLocaleString()}
                    </span>
                  </div>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Rider ID
                  </span>
                  <div className="flex items-center gap-2">
                    <User className="h-3 w-3 text-muted-foreground" />
                    <span className="text-sm font-mono">
                      {transaction.riderId}
                    </span>
                    <CopyButton value={transaction.riderId} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card border-0">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Route className="h-5 w-5" />
                  Source Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Campaign ID
                  </span>
                  {transaction.campaignId ? (
                    <div className="flex items-center gap-2">
                      <Megaphone className="h-3 w-3 text-muted-foreground" />
                      <span className="text-sm font-mono">
                        {transaction.campaignId}
                      </span>
                      <CopyButton value={transaction.campaignId} />
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Route ID
                  </span>
                  {transaction.routeId ? (
                    <div className="flex items-center gap-2">
                      <Route className="h-3 w-3 text-muted-foreground" />
                      <span className="text-sm font-mono">
                        {transaction.routeId}
                      </span>
                      <CopyButton value={transaction.routeId} />
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </div>
                <Separator />
                <div className="flex items-start justify-between gap-3">
                  <span className="text-sm text-muted-foreground">
                    Description
                  </span>
                  <span className="text-sm text-muted-foreground text-right">
                    {transaction.description || "No description provided."}
                  </span>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Created By
                  </span>
                  <span className="text-sm font-medium">
                    {transaction.createdBy || "System"}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <DrawerFooter className="border-t border-border/50 flex flex-row items-center justify-end gap-2">
          <DrawerClose asChild>
            <Button variant="outline">Close</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
