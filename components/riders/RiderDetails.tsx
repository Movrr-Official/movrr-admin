"use client";

import { Button } from "@/components/ui/button";
import {
  Edit,
  Mail,
  Phone,
  Calendar,
  Clock,
  User as UserIcon,
  MapPin,
  Bike,
  HardHat,
  Star,
  BarChart2,
  Check,
  X,
  ClipboardList,
  Hash,
  Route,
  Clock4,
  Shield,
  AlertTriangle,
  Zap,
  Euro,
} from "lucide-react";
import React, { useState } from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { format } from "date-fns";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { CopyButton } from "@/components/CopyButton";
import { mockRiders } from "@/data/mockRiders";
import { EditRiderDrawer } from "./EditRiderDrawer";

const RiderDetails = ({ riderId }: { riderId: string | undefined }) => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const riderData =
    mockRiders.find((rider) => rider.id === riderId) || mockRiders[0];

  return (
    <div className="space-y-6 overflow-y-auto pr-1 max-h-[calc(100vh-120px)]">
      {/* Edit Button */}
      <div className="flex justify-end">
        <Button
          onClick={() => setIsDrawerOpen(true)}
          className="flex items-center gap-1"
        >
          <Edit className="h-4 w-4" />
          Edit
        </Button>
      </div>

      {/* Rider Header */}
      <div className="flex items-center gap-4">
        <Avatar className="h-16 w-16">
          <AvatarImage src={riderData.avatarUrl} alt={riderData.name} />
          <AvatarFallback className="bg-primary text-primary-foreground text-xl">
            {riderData.name.substring(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div>
          <h2 className="text-2xl font-bold">{riderData.name}</h2>
          <div className="flex items-center gap-2 mt-1">
            <Badge className="bg-orange-100 text-orange-800">Rider</Badge>
            <Badge
              variant={
                riderData.status === "active"
                  ? "default"
                  : riderData.status === "inactive"
                    ? "secondary"
                    : "destructive"
              }
              className="capitalize"
            >
              {riderData.status}
            </Badge>
            {riderData?.rating >= 4.5 && (
              <Badge variant="outline" className="flex items-center gap-1">
                <Star className="h-3 w-3 text-yellow-500 fill-current" />
                Top Performer
              </Badge>
            )}
          </div>
        </div>
      </div>

      <Separator />

      {/* Rider Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Basic Information */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center">
              <UserIcon className="h-5 w-5 mr-2 text-primary" />
              <CardTitle className="text-lg">Basic Information</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <p className="font-medium flex items-center">
                  <Mail className="h-4 w-4 mr-1 text-muted-foreground" />
                  <Link
                    href={`mailto:${riderData.email}`}
                    className="text-primary hover:underline"
                  >
                    {riderData.email}
                  </Link>
                </p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Phone</p>
                <p className="font-medium flex items-center">
                  <Phone className="h-4 w-4 mr-1 text-muted-foreground" />
                  {riderData.phone || "Not specified"}
                </p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Rider ID</p>
                <p className="font-medium flex items-center">
                  <Hash className="h-4 w-4 mr-1 text-muted-foreground" />
                  <span className="font-mono text-sm">
                    {riderData.id}
                    <CopyButton value={riderData.id} />
                  </span>
                </p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Joined Date</p>
                <p className="font-medium flex items-center">
                  <Calendar className="h-4 w-4 mr-1 text-muted-foreground" />
                  {format(new Date(riderData.createdAt), "MMM d, yyyy")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Performance Metrics */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center">
              <BarChart2 className="h-5 w-5 mr-2 text-indigo-500" />
              <CardTitle className="text-lg">Performance</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Rating</p>
                <div className="flex items-center gap-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`h-4 w-4 ${
                        i < Math.floor(riderData.rating)
                          ? "text-yellow-400 fill-current"
                          : "text-gray-300"
                      }`}
                    />
                  ))}
                  <span className="ml-1 text-sm">{riderData.rating}</span>
                </div>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Total Rides</p>
                <p className="font-medium flex items-center">
                  <Route className="h-4 w-4 mr-1 text-muted-foreground" />
                  {riderData.totalRides}
                </p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Total Earnings</p>
                <p className="font-medium flex items-center">
                  <Euro className="h-4 w-4 mr-1 text-muted-foreground" />€
                  {riderData.totalEarnings.toLocaleString()}
                </p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Avg. Ride Time</p>
                <p className="font-medium flex items-center">
                  <Clock4 className="h-4 w-4 mr-1 text-muted-foreground" />
                  {riderData.avgRideTime || "N/A"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Current Assignment */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center">
              <MapPin className="h-5 w-5 mr-2 text-green-500" />
              <CardTitle className="text-lg">Current Assignment</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Assigned Route</p>
                <p className="font-medium flex items-center">
                  <Route className="h-4 w-4 mr-1 text-muted-foreground" />
                  {typeof riderData.currentRoute === "string"
                    ? riderData.currentRoute
                    : riderData.currentRoute
                      ? riderData.currentRoute.name
                      : "Not assigned"}
                </p>
              </div>

              {riderData.currentRoute && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Campaign</p>
                      <p className="font-medium flex items-center">
                        <ClipboardList className="h-4 w-4 mr-1 text-muted-foreground" />
                        {riderData.currentCampaign || "N/A"}
                      </p>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Progress</p>
                    <div className="w-full relative h-[0.2rem] bg-gray-200 mt-2 rounded-full overflow-visible">
                      <div
                        className="absolute left-0 top-1/2 -translate-y-1/2 h-2 bg-green-600 rounded-full transition-all duration-300"
                        style={{ width: `${riderData.routeProgress || 0}%` }}
                      ></div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {riderData.routeProgress || 0}% completed
                    </p>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Equipment & Safety */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center">
              <Shield className="h-5 w-5 mr-2 text-blue-500" />
              <CardTitle className="text-lg">Equipment & Safety</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Vehicle Type</p>
                <p className="font-medium flex items-center">
                  <Bike className="h-4 w-4 mr-1 text-muted-foreground" />
                  {riderData.vehicle.type || "Not specified"}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Vehicle Model</p>
                <p className="font-medium">
                  {riderData.vehicle.model || "N/A"}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Safety Gear</p>
                <p className="font-medium flex items-center">
                  <HardHat className="h-4 w-4 mr-1 text-muted-foreground" />
                  {riderData.hasHelmet ? "Full gear" : "Incomplete"}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Certification</p>
                <p className="font-medium flex items-center">
                  {riderData.isCertified ? (
                    <>
                      <Check className="h-4 w-4 mr-1 text-green-500" />
                      <span>Certified</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="h-4 w-4 mr-1 text-yellow-500" />
                      <span>Pending</span>
                    </>
                  )}
                </p>
              </div>
              {riderData.vehicle.lastInspection && (
                <div className="col-span-2">
                  <p className="text-sm text-muted-foreground">
                    Last Inspection
                  </p>
                  <p className="font-medium flex items-center">
                    <Calendar className="h-4 w-4 mr-1 text-muted-foreground" />
                    {format(
                      new Date(riderData.vehicle.lastInspection),
                      "MMM d, yyyy"
                    )}
                    {riderData.vehicle.inspectionStatus === "passed" ? (
                      <Badge
                        variant="outline"
                        className="ml-2 flex items-center gap-1"
                      >
                        <Check className="h-3 w-3 text-green-500" />
                        Passed
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="ml-2 flex items-center gap-1"
                      >
                        <X className="h-3 w-3 text-red-500" />
                        Issues found
                      </Badge>
                    )}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Availability */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center">
              <Calendar className="h-5 w-5 mr-2 text-purple-500" />
              <CardTitle className="text-lg">Availability</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-2">
              {(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const).map(
                (day) => {
                  // Map display day to the correct key in the availability object
                  const dayKeyMap: {
                    [key: string]: keyof typeof riderData.availability;
                  } = {
                    Mon: "monday",
                    Tue: "tuesday",
                    Wed: "wednesday",
                    Thu: "thursday",
                    Fri: "friday",
                    Sat: "saturday",
                    Sun: "sunday",
                  };
                  const key = dayKeyMap[day];
                  return (
                    <div key={day} className="flex flex-col items-center">
                      <span className="text-sm text-muted-foreground">
                        {day}
                      </span>
                      {riderData.availability[key] ? (
                        <Check className="h-4 w-4 text-green-500 mt-1" />
                      ) : (
                        <X className="h-4 w-4 text-red-500 mt-1" />
                      )}
                    </div>
                  );
                }
              )}
            </div>
            <div className="mt-4">
              <p className="text-sm text-muted-foreground">Preferred Hours</p>
              <p className="font-medium flex items-center">
                <Clock className="h-4 w-4 mr-1 text-muted-foreground" />
                {riderData.preferredHours
                  ? riderData.preferredHours.charAt(0).toUpperCase() +
                    riderData.preferredHours.slice(1)
                  : "Flexible"}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Status Card */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                {riderData.status === "active" ? (
                  <Zap className="h-5 w-5 mr-2 text-green-500" />
                ) : (
                  <X className="h-5 w-5 mr-2 text-red-500" />
                )}
                <CardTitle className="text-lg">Rider Status</CardTitle>
              </div>
              <Badge
                variant={
                  riderData.status === "active"
                    ? "default"
                    : riderData.status === "inactive"
                      ? "secondary"
                      : "destructive"
                }
                className="capitalize"
              >
                {riderData.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-4">
              <div
                className={cn(
                  "h-11 w-11 rounded-full flex items-center justify-center shrink-0",
                  riderData.status === "active"
                    ? "bg-green-50"
                    : riderData.status === "inactive"
                      ? "bg-gray-50"
                      : "bg-red-50"
                )}
              >
                {riderData.status === "active" ? (
                  <Zap className="h-6 w-6 text-green-600" />
                ) : riderData.status === "inactive" ? (
                  <Clock className="h-6 w-6 text-gray-600" />
                ) : (
                  <X className="h-6 w-6 text-red-600" />
                )}
              </div>

              <div>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      riderData.status === "active"
                        ? "bg-green-500"
                        : riderData.status === "inactive"
                          ? "bg-gray-500"
                          : "bg-red-500"
                    )}
                  ></span>
                  <span className="text-sm text-muted-foreground">
                    {riderData.status === "active"
                      ? "Available for assignments"
                      : riderData.status === "inactive"
                        ? "Not currently available"
                        : "Account suspended"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {riderData.status === "active"
                    ? "This rider is active and can be assigned to routes"
                    : riderData.status === "inactive"
                      ? "This rider is not currently taking assignments"
                      : "This rider cannot be assigned to routes"}
                </p>
                {riderData.lastActive && (
                  <div className="flex items-center gap-2 mt-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">
                      Last active:{" "}
                      {format(new Date(riderData.lastActive), "MMM d, h:mm a")}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Edit Rider Drawer */}
      <EditRiderDrawer
        rider={riderData}
        isOpen={isDrawerOpen}
        onClose={setIsDrawerOpen}
      />
    </div>
  );
};

export default RiderDetails;
