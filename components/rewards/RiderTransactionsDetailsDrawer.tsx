"use client";

import React from "react";
import {
  AlertTriangle,
  Calendar,
  Coins,
  Edit,
  Megaphone,
  Route,
  Timer,
  TrendingDown,
  TrendingUp,
  User,
  X,
  Zap,
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
  DrawerDescription,
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
        <Badge variant="success">
          <TrendingUp className="h-3 w-3 mr-1" />
          Awarded
        </Badge>
      );
    case "redeemed":
      return (
        <Badge variant="info">
          <TrendingDown className="h-3 w-3 mr-1" />
          Redeemed
        </Badge>
      );
    case "adjusted":
      return (
        <Badge variant="warning">
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
      <DrawerContent className="border-border h-full w-full sm:w-[360px] lg:max-w-[60rem]! p-0">
        <DrawerHeader className="border-b border-border/50">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <DrawerTitle className="text-2xl font-bold mb-2">
                Transaction Details
              </DrawerTitle>
              <DrawerDescription className="sr-only">
                View rider wallet transaction details.
              </DrawerDescription>
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
            <Card className="border-border">
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
                      <TrendingUp className="h-4 w-4 text-success" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-destructive" />
                    )}
                    <span
                      className={`text-sm font-semibold ${ isPositive ? "text-success" : "text-destructive" }`}
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
                    <Coins className="h-4 w-4 text-warning" />
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

            <Card className="border-border">
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

          {/* Earning breakdown — shown for ride-based transactions that have metadata */}
          {(transaction.basePoints != null ||
            transaction.verifiedMinutes != null ||
            transaction.wasCapped != null ||
            (transaction.bonusBreakdown &&
              transaction.bonusBreakdown.length > 0)) && (
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Zap className="h-4 w-4 text-warning" />
                  Earning Breakdown
                  {transaction.wasCapped && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning dark:bg-warning/15 dark:text-warning">
                      <AlertTriangle className="h-3 w-3" />
                      Daily cap hit
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {transaction.verifiedMinutes != null && (
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Timer className="h-3.5 w-3.5" />
                      Verified minutes
                    </div>
                    <span className="font-medium">
                      {transaction.verifiedMinutes} min
                    </span>
                  </div>
                )}
                {transaction.basePoints != null && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Base points</span>
                    <span className="font-medium">
                      +{transaction.basePoints}
                    </span>
                  </div>
                )}
                {transaction.multiplier != null &&
                  transaction.multiplier !== 1 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        Earning multiplier
                      </span>
                      <span className="font-medium">
                        {transaction.multiplier}×
                      </span>
                    </div>
                  )}
                {transaction.campaignBoostMultiplier != null &&
                  transaction.campaignBoostMultiplier !== 1 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        Campaign boost
                      </span>
                      <span className="font-medium text-secondary-foreground">
                        {transaction.campaignBoostMultiplier}×
                      </span>
                    </div>
                  )}
                {transaction.bonusBreakdown &&
                  transaction.bonusBreakdown.length > 0 && (
                    <>
                      <Separator />
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Bonuses
                      </p>
                      {transaction.bonusBreakdown.map((bonus, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between text-sm"
                        >
                          <span className="text-muted-foreground">
                            {bonus.label ?? bonus.type}
                          </span>
                          <span className="font-medium text-success">
                            {bonus.points != null
                              ? `+${bonus.points}`
                              : bonus.multiplier != null
                                ? `${bonus.multiplier}×`
                                : "—"}
                          </span>
                        </div>
                      ))}
                    </>
                  )}
                {transaction.wasCapped && (
                  <div className="mt-2 rounded-lg bg-warning/15 dark:bg-warning/15 px-3 py-2 text-xs text-warning dark:text-warning">
                    This transaction was reduced because the rider reached their
                    daily earning cap. Some points were not awarded.
                  </div>
                )}
              </CardContent>
            </Card>
          )}
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
