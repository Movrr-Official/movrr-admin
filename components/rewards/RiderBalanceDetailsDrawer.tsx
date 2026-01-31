"use client";

import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  X,
  Coins,
  TrendingUp,
  TrendingDown,
  Edit,
  Save,
  Loader2,
  History,
  User,
  Calendar,
  AlertCircle,
} from "lucide-react";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from "@/components/ui/drawer";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { RiderBalance } from "@/schemas";
import { CopyButton } from "@/components/CopyButton";
import { useToast } from "@/hooks/useToast";
import { adjustRiderPoints } from "@/app/actions/rewards";
import { useRewardTransactions } from "@/hooks/useRewardsData";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const adjustPointsSchema = z.object({
  points: z.number().int().min(-1000000).max(1000000),
  description: z.string().min(1, "Description is required"),
  type: z.enum(["adjusted"]),
});

type AdjustPointsFormData = z.infer<typeof adjustPointsSchema>;

interface RiderBalanceDetailsDrawerProps {
  balance: RiderBalance | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBalanceUpdate?: () => void;
}

export function RiderBalanceDetailsDrawer({
  balance,
  open,
  onOpenChange,
  onBalanceUpdate,
}: RiderBalanceDetailsDrawerProps) {
  const { toast } = useToast();
  const [isEditMode, setIsEditMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingAdjustment, setPendingAdjustment] =
    useState<AdjustPointsFormData | null>(null);

  const { data: transactions, isLoading: isLoadingTransactions } =
    useRewardTransactions(balance ? { riderId: balance.riderId } : undefined);

  const form = useForm<AdjustPointsFormData>({
    resolver: zodResolver(adjustPointsSchema),
    defaultValues: {
      points: 0,
      description: "",
      type: "adjusted",
    },
  });

  // Reset form when drawer closes
  useEffect(() => {
    if (!open) {
      setIsEditMode(false);
      form.reset();
      setPendingAdjustment(null);
    }
  }, [open, form]);

  const handleSave = async (data: AdjustPointsFormData) => {
    if (!balance) return;

    setPendingAdjustment(data);
    setShowConfirmDialog(true);
  };

  const handleConfirmAdjustment = async () => {
    if (!balance || !pendingAdjustment) return;

    setIsLoading(true);
    try {
      const result = await adjustRiderPoints({
        riderId: balance.riderId,
        points: pendingAdjustment.points,
        description: pendingAdjustment.description,
        type: pendingAdjustment.type,
      });

      if (!result.success) {
        throw new Error(result.error || "Failed to adjust points");
      }

      toast({
        title: "Points Adjusted",
        description: `Successfully ${pendingAdjustment.points >= 0 ? "added" : "deducted"} ${Math.abs(pendingAdjustment.points)} points for ${balance.riderName}.`,
      });

      setShowConfirmDialog(false);
      setPendingAdjustment(null);
      setIsEditMode(false);
      form.reset();
      onBalanceUpdate?.();
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Adjustment Failed",
        description:
          error instanceof Error
            ? error.message
            : "Failed to adjust points. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    form.reset();
    setIsEditMode(false);
    setPendingAdjustment(null);
  };

  if (!balance) return null;

  const balanceHistory = transactions || [];

  return (
    <>
      <Drawer direction="right" open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="glass-card border-0 backdrop-blur-xl h-full w-full sm:w-[360px] lg:max-w-[60rem]! p-0">
          <DrawerHeader className="border-b border-border/50">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <DrawerTitle className="text-2xl font-bold mb-2">
                  {balance.riderName}
                </DrawerTitle>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="font-medium">
                    <User className="h-3 w-3 mr-1" />
                    Rider
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

          <div className="overflow-y-auto flex-1 p-6">
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="history">Balance History</TabsTrigger>
              </TabsList>

              {/* Overview Tab */}
              <TabsContent value="overview" className="space-y-4 mt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Balance Information */}
                  <Card className="glass-card border-0">
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Coins className="h-5 w-5" />
                        Balance Information
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                          Rider ID
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-mono">
                            {balance.riderId}
                          </span>
                          <CopyButton value={balance.riderId} />
                        </div>
                      </div>
                      <Separator />
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                          Email
                        </span>
                        <span className="text-sm font-medium">
                          {balance.riderEmail}
                        </span>
                      </div>
                      <Separator />
                      <div className="flex items-center justify-between p-4 rounded-lg bg-primary/10">
                        <span className="text-sm font-medium">
                          Current Balance
                        </span>
                        <div className="flex items-center gap-2">
                          <Coins className="h-5 w-5 text-amber-600" />
                          <span className="text-2xl font-bold">
                            {balance.currentBalance.toLocaleString()}
                          </span>
                        </div>
                      </div>
                      <Separator />
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                          Total Points Awarded
                        </span>
                        <div className="flex items-center gap-2">
                          <TrendingUp className="h-4 w-4 text-green-600" />
                          <span className="text-sm font-semibold text-green-600">
                            {balance.totalPointsAwarded.toLocaleString()}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                          Total Points Redeemed
                        </span>
                        <div className="flex items-center gap-2">
                          <TrendingDown className="h-4 w-4 text-blue-600" />
                          <span className="text-sm font-semibold text-blue-600">
                            {balance.totalPointsRedeemed.toLocaleString()}
                          </span>
                        </div>
                      </div>
                      {balance.lastTransactionDate && (
                        <>
                          <Separator />
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">
                              Last Transaction
                            </span>
                            <span className="text-sm font-medium">
                              {format(
                                new Date(balance.lastTransactionDate),
                                "MMM d, yyyy HH:mm",
                              )}
                            </span>
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>

                  {/* Adjust Points Form */}
                  <Card className="glass-card border-0">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Edit className="h-5 w-5" />
                          Adjust Points
                        </CardTitle>
                        {!isEditMode && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setIsEditMode(true)}
                          >
                            <Edit className="mr-2 h-4 w-4" />
                            Adjust
                          </Button>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      {isEditMode ? (
                        <Form {...form}>
                          <form
                            onSubmit={form.handleSubmit(handleSave)}
                            className="space-y-4"
                          >
                            <FormField
                              control={form.control}
                              name="points"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Points Adjustment</FormLabel>
                                  <FormControl>
                                    <Input
                                      type="number"
                                      placeholder="Enter points (positive to add, negative to deduct)"
                                      {...field}
                                      onChange={(e) =>
                                        field.onChange(
                                          parseInt(e.target.value) || 0,
                                        )
                                      }
                                    />
                                  </FormControl>
                                  <FormDescription>
                                    Enter positive number to add points,
                                    negative to deduct. Current balance:{" "}
                                    {balance.currentBalance.toLocaleString()}
                                  </FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name="description"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Reason</FormLabel>
                                  <FormControl>
                                    <Textarea
                                      placeholder="Enter reason for adjustment..."
                                      {...field}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <div className="flex gap-2">
                              <Button
                                type="submit"
                                disabled={isLoading}
                                className="flex-1"
                              >
                                {isLoading ? (
                                  <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Saving...
                                  </>
                                ) : (
                                  <>
                                    <Save className="mr-2 h-4 w-4" />
                                    Save Adjustment
                                  </>
                                )}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                onClick={handleCancel}
                                disabled={isLoading}
                              >
                                Cancel
                              </Button>
                            </div>
                          </form>
                        </Form>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-8">
                          <AlertCircle className="h-12 w-12 text-muted-foreground mb-2" />
                          <p className="text-sm text-muted-foreground text-center">
                            Click "Adjust" to modify this rider's point balance
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* Balance History Tab */}
              <TabsContent value="history" className="space-y-4 mt-4">
                <Card className="glass-card border-0">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <History className="h-5 w-5" />
                      Transaction History
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {isLoadingTransactions ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : balanceHistory.length > 0 ? (
                      <div className="space-y-2">
                        {balanceHistory.map((transaction, index) => {
                          const isPositive = transaction.points > 0;
                          return (
                            <div
                              key={transaction.id}
                              className="flex items-center justify-between p-3 rounded-lg bg-muted/30"
                            >
                              <div className="flex items-center gap-3 flex-1">
                                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-semibold">
                                  {balanceHistory.length - index}
                                </div>
                                <div className="flex-1">
                                  <p className="text-sm font-medium">
                                    {transaction.description || "Transaction"}
                                  </p>
                                  <div className="flex items-center gap-2 mt-1">
                                    <Badge
                                      variant="outline"
                                      className="text-xs"
                                    >
                                      {transaction.type}
                                    </Badge>
                                    {transaction.campaignId && (
                                      <span className="text-xs text-muted-foreground">
                                        Campaign: {transaction.campaignId}
                                      </span>
                                    )}
                                    {transaction.routeId && (
                                      <span className="text-xs text-muted-foreground">
                                        Route: {transaction.routeId}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {format(
                                      new Date(transaction.createdAt),
                                      "MMM d, yyyy HH:mm",
                                    )}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-4">
                                <div className="text-right">
                                  <p
                                    className={`text-sm font-semibold ${
                                      isPositive
                                        ? "text-green-600"
                                        : "text-red-600"
                                    }`}
                                  >
                                    {isPositive ? "+" : ""}
                                    {transaction.points.toLocaleString()}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    Balance:{" "}
                                    {transaction.balanceAfter.toLocaleString()}
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-8">
                        <History className="h-12 w-12 text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">
                          No transaction history available
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          <DrawerFooter className="border-t border-border/50 flex flex-row items-center justify-end gap-2">
            <DrawerClose asChild>
              <Button variant="outline">Close</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent className="glass-card border-0 backdrop-blur-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Points Adjustment</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAdjustment && (
                <>
                  You are about to{" "}
                  {pendingAdjustment.points >= 0 ? "add" : "deduct"}{" "}
                  {Math.abs(pendingAdjustment.points).toLocaleString()} points
                  for {balance?.riderName}.
                  <br />
                  <br />
                  <strong>Current Balance:</strong>{" "}
                  {balance?.currentBalance.toLocaleString()}
                  <br />
                  <strong>New Balance:</strong>{" "}
                  {(balance?.currentBalance || 0) + pendingAdjustment.points >=
                  0
                    ? (balance?.currentBalance || 0) + pendingAdjustment.points
                    : 0}
                  <br />
                  <br />
                  <strong>Reason:</strong> {pendingAdjustment.description}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmAdjustment}
              disabled={isLoading}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isLoading ? "Adjusting..." : "Confirm Adjustment"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
