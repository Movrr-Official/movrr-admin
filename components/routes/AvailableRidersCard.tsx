"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Users } from "lucide-react";
import { useRidersData } from "@/hooks/useRidersData";

const MIN_RIDERS = 4;
const MAX_RIDERS = 5;

export function AvailableRidersCard() {
  const { data: riders, isLoading } = useRidersData({ status: "active" });

  const { assignedRiders, availableRiders } = useMemo(() => {
    const activeRiders = (riders ?? []).filter(
      (rider) => rider.status === "active",
    );
    const assigned = activeRiders.filter((rider) => rider.currentRoute);
    const available = activeRiders.filter((rider) => !rider.currentRoute);
    return {
      assignedRiders: assigned,
      availableRiders: available,
    };
  }, [riders]);

  const uniqueAvailableRiders = useMemo(() => {
    const map = new Map<string, (typeof availableRiders)[number]>();
    availableRiders.forEach((rider) => {
      map.set(rider.id, rider);
    });
    return Array.from(map.values());
  }, [availableRiders]);

  const uniqueAllRiders = useMemo(() => {
    const map = new Map<string, (typeof availableRiders)[number]>();
    [...assignedRiders, ...uniqueAvailableRiders].forEach((rider) => {
      map.set(rider.id, rider);
    });
    return Array.from(map.values());
  }, [assignedRiders, uniqueAvailableRiders]);

  const [rotationIndex, setRotationIndex] = useState(0);

  useEffect(() => {
    if (uniqueAllRiders.length <= MIN_RIDERS) {
      return;
    }

    const interval = setInterval(() => {
      setRotationIndex((prev) => (prev + 1) % uniqueAllRiders.length);
    }, 3000);

    return () => clearInterval(interval);
  }, [uniqueAllRiders.length]);

  const visibleRiders = useMemo(() => {
    if (uniqueAllRiders.length === 0) return [];
    if (uniqueAllRiders.length <= MAX_RIDERS) {
      return uniqueAllRiders;
    }

    const windowSize =
      uniqueAllRiders.length <= MIN_RIDERS ? MIN_RIDERS : MAX_RIDERS;
    const window: typeof uniqueAllRiders = [];
    for (let idx = 0; idx < windowSize; idx += 1) {
      const rider =
        uniqueAllRiders[(rotationIndex + idx) % uniqueAllRiders.length];
      window.push(rider);
    }
    return window;
  }, [uniqueAllRiders, rotationIndex]);

  return (
    <Card className="glass-card border-0 w-full max-w-[500px]">
      <CardHeader>
        <CardTitle className="text-lg font-bold flex items-center gap-2">
          <Users className="h-5 w-5" />
          Available Riders
        </CardTitle>
        <CardDescription>Riders ready for route assignment</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary">{assignedRiders.length} assigned</Badge>
          <Badge variant="outline">{uniqueAvailableRiders.length} ready</Badge>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading riders...</p>
        ) : visibleRiders.length > 0 ? (
          <div className="space-y-3">
            {visibleRiders.map((rider) => {
              const hasRoute = Boolean(rider.currentRoute);
              const initials = rider.name
                .split(" ")
                .map((part) => part[0])
                .join("")
                .slice(0, 2)
                .toUpperCase();

              return (
                <div
                  key={rider.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-muted/30 p-3"
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9">
                      <AvatarImage
                        src={rider.avatarUrl ?? ""}
                        alt={rider.name}
                      />
                      <AvatarFallback>{initials}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-semibold">{rider.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {hasRoute
                          ? (rider.currentRoute?.name ?? "Assigned route")
                          : "Ready for assignment"}
                      </p>
                    </div>
                  </div>
                  <Badge variant={hasRoute ? "secondary" : "outline"}>
                    {hasRoute ? "Assigned" : "Ready"}
                  </Badge>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No active riders available.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
