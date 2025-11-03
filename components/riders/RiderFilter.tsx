"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { FilterX, Search, Bike, Star } from "lucide-react";
import { motion } from "framer-motion";
import { riderFiltersSchema, RiderFiltersSchema } from "@/schemas";
import { useToast } from "@/hooks/useToast";

interface RiderFiltersProps {
  onFilterChange: (filters: RiderFiltersSchema) => void;
  isLoading?: boolean;
}

const statusOptions = [
  { value: "all", label: "All Statuses" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "suspended", label: "Suspended" },
];

const vehicleOptions = [
  { value: "all", label: "All Vehicles" },
  { value: "bike", label: "Bicycle" },
  { value: "e-bike", label: "E-Bike" },
  { value: "cargo", label: "Cargo Bike" },
  { value: "scooter", label: "Scooter" },
];

const ratingOptions = [
  { value: "all", label: "All Ratings" },
  { value: "4.5", label: "4.5+ Stars" },
  { value: "4", label: "4+ Stars" },
  { value: "3", label: "3+ Stars" },
];

const RiderFilters = ({ onFilterChange, isLoading }: RiderFiltersProps) => {
  const { toast } = useToast();

  const form = useForm<RiderFiltersSchema>({
    resolver: zodResolver(riderFiltersSchema),
    defaultValues: {
      status: "all",
      vehicleType: "all",
      minRating: "all",
      searchQuery: "",
    },
  });

  const onSubmit = (data: RiderFiltersSchema) => {
    onFilterChange(data);
    toast({ description: "Filters applied" });
  };

  const resetFilters = () => {
    form.reset();
    onFilterChange({});
    toast({ description: "Filters cleared" });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
        >
          {/* Search Query */}
          <FormField
            control={form.control}
            name="searchQuery"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Search</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search riders..."
                      className="pl-9"
                      {...field}
                    />
                  </div>
                </FormControl>
              </FormItem>
            )}
          />

          {/* Status Filter */}
          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Status</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="All Statuses" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {statusOptions.map((status) => (
                      <SelectItem key={status.value} value={status.value}>
                        {status.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />

          {/* Vehicle Type Filter */}
          <FormField
            control={form.control}
            name="vehicleType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Vehicle</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="All Vehicles" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {vehicleOptions.map((vehicle) => (
                      <SelectItem key={vehicle.value} value={vehicle.value}>
                        <div className="flex items-center gap-2">
                          <Bike className="h-4 w-4" />
                          {vehicle.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />

          {/* Rating Filter */}
          <FormField
            control={form.control}
            name="minRating"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Min Rating</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="All Ratings" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {ratingOptions.map((rating) => (
                      <SelectItem key={rating.value} value={rating.value}>
                        <div className="flex items-center gap-2">
                          <Star className="h-4 w-4 text-yellow-400 fill-current" />
                          {rating.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />

          <div className="flex items-center justify-start gap-2 md:col-span-4">
            <Button
              type="button"
              variant="outline"
              onClick={resetFilters}
              disabled={isLoading}
            >
              <FilterX className="mr-2 h-4 w-4" />
              Clear Filters
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Applying..." : "Apply Filters"}
            </Button>
          </div>
        </motion.div>
      </form>
    </Form>
  );
};

export default RiderFilters;
