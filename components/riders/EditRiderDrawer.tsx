"use client";

import React, { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
  SheetFooter,
} from "@/components/ui/sheet";
import { Rider, RiderStatus, updateRiderSchema } from "@/schemas";
import { useForm } from "react-hook-form";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Bike,
  MapPin,
  Clock,
  HardHat,
  Award,
  Star,
  User as UserIcon,
  Mail,
  Phone,
  Globe,
  FileText,
  X,
  Shield,
  Euro,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/useToast";
import z from "zod";

const statusColors: Record<RiderStatus, string> = {
  active: "bg-green-100 text-green-800",
  inactive: "bg-gray-100 text-gray-800",
  suspended: "bg-red-100 text-red-800",
  pending: "bg-yellow-100 text-yellow-800",
};

interface EditRiderDrawerProps {
  rider: Rider;
  isOpen: boolean;
  onClose: (open: boolean) => void;
  onSuccess?: () => void;
}

export function EditRiderDrawer({
  rider,
  isOpen,
  onClose,
  onSuccess,
}: EditRiderDrawerProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const form = useForm({
    defaultValues: {
      ...rider,
      vehicleType: rider.vehicle?.type || "",
      vehicleModel: rider.vehicle?.model || "",
    },
  });

  const onSubmit = async (data: z.infer<typeof updateRiderSchema>) => {
    try {
      setIsSubmitting(true);
      const formData = new FormData();

      // Append all form data
      Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          formData.append(key, String(value));
        }
      });

      const result = formData.get("status") === "active";

      if (result) {
        toast({
          title: "Success",
          description: "Rider status updated successfully",
          variant: "default",
        });
        onSuccess?.();
        onClose(false);
      } else {
        toast({
          title: "Error",
          description: "Failed to update rider status",
          variant: "destructive",
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusChange = async (checked: boolean) => {
    try {
      setIsSubmitting(true);
      const formData = new FormData();
      formData.append("riderId", rider.id);
      formData.append("status", checked ? "active" : "inactive");

      const result = formData.get("status") === "active";

      if (result) {
        toast({
          title: "Success",
          description: "Rider status updated successfully",
          variant: "default",
        });
        onSuccess?.();
      } else {
        toast({
          title: "Error",
          description: "Failed to update rider status",
          variant: "destructive",
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-[60rem]! p-0">
        <div className="h-full flex flex-col">
          <SheetHeader className="px-6 py-4 border-b">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-xl font-semibold">
                Edit Rider Profile
              </SheetTitle>
              <SheetClose className="rounded-full h-8 w-8 flex items-center justify-center hover:bg-muted transition-colors">
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </SheetClose>
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-auto px-6 py-4 space-y-6">
            {/* Rider Profile Header */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-4 p-4 bg-muted/50 rounded-lg"
            >
              <Avatar className="h-14 w-14">
                <AvatarImage src={rider.avatarUrl} alt={rider.name} />
                <AvatarFallback className="bg-primary text-primary-foreground text-xl">
                  {rider.name.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="space-y-1">
                <h2 className="text-lg font-semibold">{rider.name}</h2>
                <div className="flex items-center gap-2">
                  <Badge className="bg-orange-100 text-orange-800">Rider</Badge>
                  <Badge className={statusColors[rider.status]}>
                    {rider.status}
                  </Badge>
                  {rider.rating >= 4.5 && (
                    <Badge
                      variant="outline"
                      className="flex items-center gap-1"
                    >
                      <Star className="h-3 w-3 text-yellow-500 fill-current" />
                      Top Performer
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  Member since {format(new Date(rider.createdAt), "MMM yyyy")}
                </p>
              </div>
            </motion.div>

            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-6"
              >
                {/* Basic Information Section */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="space-y-4"
                >
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    Basic Information
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            <UserIcon className="h-4 w-4" />
                            Full Name
                          </FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Rider's full name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            <Mail className="h-4 w-4" />
                            Email
                          </FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Email address" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            <Phone className="h-4 w-4" />
                            Phone
                          </FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Phone number" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      name="languagePreference"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            <Globe className="h-4 w-4" />
                            Language
                          </FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select language" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="en">English</SelectItem>
                              <SelectItem value="nl">Dutch</SelectItem>
                              <SelectItem value="fr">French</SelectItem>
                              <SelectItem value="de">German</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      name="accountNotes"
                      render={({ field }) => (
                        <FormItem className="col-span-2">
                          <FormLabel className="flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            Rider Notes
                          </FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="Notes about this rider"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </motion.div>

                {/* Status Section */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="space-y-4"
                >
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    Account Settings
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormItem>
                      <FormLabel>Account Status</FormLabel>
                      <div className="flex items-center gap-4">
                        <Switch
                          checked={rider.status === "active"}
                          onCheckedChange={handleStatusChange}
                          disabled={isSubmitting}
                        />
                        <Badge className={statusColors[rider.status]}>
                          {rider.status}
                        </Badge>
                      </div>
                    </FormItem>
                    <FormField
                      name="isCertified"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="flex items-center gap-2">
                              <Shield className="h-4 w-4" />
                              Safety Certified
                            </FormLabel>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </motion.div>

                {/* Rider-Specific Fields */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="space-y-4"
                >
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    Rider Details
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      name="assignedRoute"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            <MapPin className="h-4 w-4" />
                            Assigned Route
                          </FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Current route" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      name="rating"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            <Star className="h-4 w-4" />
                            Performance Rating
                          </FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="number"
                              step="0.1"
                              min="0"
                              max="5"
                              placeholder="Rating (0-5)"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      name="vehicleType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            <Bike className="h-4 w-4" />
                            Vehicle Type
                          </FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select vehicle" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="bike">Bicycle</SelectItem>
                              <SelectItem value="e-bike">E-Bike</SelectItem>
                              <SelectItem value="cargo">Cargo Bike</SelectItem>
                              <SelectItem value="scooter">Scooter</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      name="vehicleModel"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            <Bike className="h-4 w-4" />
                            Vehicle Model
                          </FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Model details" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      name="hasHelmet"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="flex items-center gap-2">
                              <HardHat className="h-4 w-4" />
                              Has Safety Gear
                            </FormLabel>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      name="totalEarnings"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            <Euro className="h-4 w-4" />
                            Total Earnings
                          </FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="number"
                              placeholder="Total earnings"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      name="totalRides"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            <MapPin className="h-4 w-4" />
                            Total Rides
                          </FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="number"
                              placeholder="Number of rides"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      name="campaignsCompleted"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            <Award className="h-4 w-4" />
                            Campaigns Completed
                          </FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="number"
                              placeholder="Completed campaigns"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </motion.div>

                {/* Availability Section */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="space-y-4"
                >
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    Availability
                  </h3>
                  <div className="grid grid-cols-7 gap-2">
                    {[
                      "monday",
                      "tuesday",
                      "wednesday",
                      "thursday",
                      "friday",
                      "saturday",
                      "sunday",
                    ].map((day) => (
                      <FormField
                        key={day}
                        name={`availability.${day}`}
                        render={({ field }) => (
                          <FormItem className="flex flex-col items-center">
                            <FormLabel className="text-xs uppercase">
                              {day.substring(0, 3)}
                            </FormLabel>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    ))}
                  </div>
                  <FormField
                    name="preferredHours"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          Preferred Working Hours
                        </FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select hours" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="morning">
                              Morning (6am-12pm)
                            </SelectItem>
                            <SelectItem value="afternoon">
                              Afternoon (12pm-6pm)
                            </SelectItem>
                            <SelectItem value="evening">
                              Evening (6pm-12am)
                            </SelectItem>
                            <SelectItem value="flexible">Flexible</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </motion.div>
              </form>
            </Form>
          </div>

          <SheetFooter className="px-6 py-4 border-t flex justify-end gap-2 bg-background/50 backdrop-blur-sm">
            <SheetClose asChild>
              <Button variant="outline">Cancel</Button>
            </SheetClose>
            <Button
              type="submit"
              disabled={isSubmitting}
              onClick={form.handleSubmit(onSubmit)}
            >
              {isSubmitting ? "Saving..." : "Save Changes"}
            </Button>
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
  );
}
