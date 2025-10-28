"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Clock, Repeat, Settings, Plus, Timer, Zap, Bell } from "lucide-react";
import type { ExportOptions, ExportableData } from "@/lib/export";

interface ScheduledExport {
  id: string;
  name: string;
  description?: string;
  dataSourceId: string;
  exportOptions: ExportOptions;
  schedule: {
    type: "once" | "daily" | "weekly" | "monthly";
    time: string; // HH:MM format
    dayOfWeek?: number; // 0-6 for weekly
    dayOfMonth?: number; // 1-31 for monthly
    timezone: string;
  };
  isActive: boolean;
  createdAt: Date;
  lastRun?: Date;
  nextRun: Date;
  runCount: number;
}

interface ScheduledExportDialogProps {
  dataSources: Array<{
    id: string;
    name: string;
    data: ExportableData[];
  }>;
  trigger?: React.ReactNode;
  onScheduleCreate?: (
    schedule: Omit<ScheduledExport, "id" | "createdAt" | "runCount">
  ) => void;
}

const scheduleTypes = [
  {
    value: "once",
    label: "One Time",
    description: "Export once at specified time",
  },
  {
    value: "daily",
    label: "Daily",
    description: "Export every day at specified time",
  },
  {
    value: "weekly",
    label: "Weekly",
    description: "Export weekly on specified day",
  },
  {
    value: "monthly",
    label: "Monthly",
    description: "Export monthly on specified date",
  },
];

const weekDays = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

export function ScheduledExportDialog({
  dataSources,
  trigger,
  onScheduleCreate,
}: ScheduledExportDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [scheduleName, setScheduleName] = useState("");
  const [scheduleDescription, setScheduleDescription] = useState("");
  const [selectedDataSource, setSelectedDataSource] = useState("");
  const [scheduleType, setScheduleType] = useState<
    "once" | "daily" | "weekly" | "monthly"
  >("daily");
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [scheduleDayOfWeek, setScheduleDayOfWeek] = useState(1);
  const [scheduleDayOfMonth, setScheduleDayOfMonth] = useState(1);
  const [timezone, setTimezone] = useState("UTC");
  const [exportFormat, setExportFormat] = useState<
    "csv" | "xlsx" | "pdf" | "json"
  >("csv");
  const [filename, setFilename] = useState("");
  const [includeHeaders, setIncludeHeaders] = useState(true);
  const [isActive, setIsActive] = useState(true);

  // Get user's timezone
  useEffect(() => {
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  // Auto-generate filename based on schedule name
  useEffect(() => {
    if (scheduleName && !filename) {
      setFilename(scheduleName.toLowerCase().replace(/\s+/g, "_"));
    }
  }, [scheduleName, filename]);

  const calculateNextRun = (): Date => {
    const now = new Date();
    const [hours, minutes] = scheduleTime.split(":").map(Number);

    switch (scheduleType) {
      case "once": {
        const nextRun = new Date();
        nextRun.setHours(hours, minutes, 0, 0);
        if (nextRun <= now) {
          nextRun.setDate(nextRun.getDate() + 1);
        }
        return nextRun;
      }
      case "daily": {
        const nextRun = new Date();
        nextRun.setHours(hours, minutes, 0, 0);
        if (nextRun <= now) {
          nextRun.setDate(nextRun.getDate() + 1);
        }
        return nextRun;
      }
      case "weekly": {
        const nextRun = new Date();
        nextRun.setHours(hours, minutes, 0, 0);
        const daysUntilTarget = (scheduleDayOfWeek - nextRun.getDay() + 7) % 7;
        if (daysUntilTarget === 0 && nextRun <= now) {
          nextRun.setDate(nextRun.getDate() + 7);
        } else {
          nextRun.setDate(nextRun.getDate() + daysUntilTarget);
        }
        return nextRun;
      }
      case "monthly": {
        const nextRun = new Date();
        nextRun.setDate(scheduleDayOfMonth);
        nextRun.setHours(hours, minutes, 0, 0);
        if (nextRun <= now) {
          nextRun.setMonth(nextRun.getMonth() + 1);
        }
        return nextRun;
      }
      default:
        return new Date();
    }
  };

  const handleCreateSchedule = () => {
    if (!scheduleName || !selectedDataSource) return;

    const schedule: Omit<ScheduledExport, "id" | "createdAt" | "runCount"> = {
      name: scheduleName,
      description: scheduleDescription,
      dataSourceId: selectedDataSource,
      exportOptions: {
        format: exportFormat,
        filename: filename || scheduleName.toLowerCase().replace(/\s+/g, "_"),
        includeHeaders,
      },
      schedule: {
        type: scheduleType,
        time: scheduleTime,
        ...(scheduleType === "weekly" && { dayOfWeek: scheduleDayOfWeek }),
        ...(scheduleType === "monthly" && { dayOfMonth: scheduleDayOfMonth }),
        timezone,
      },
      isActive,
      lastRun: undefined,
      nextRun: calculateNextRun(),
    };

    onScheduleCreate?.(schedule);
    setIsOpen(false);

    // Reset form
    setScheduleName("");
    setScheduleDescription("");
    setSelectedDataSource("");
    setFilename("");
  };

  const nextRun = calculateNextRun();
  const selectedSource = dataSources.find(
    (source) => source.id === selectedDataSource
  );

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="bg-gradient-to-r from-chart-4 to-chart-4/90 hover:from-chart-4/90 hover:to-chart-4/80 text-white shadow-xl hover:shadow-2xl transition-all duration-300 gap-3 group px-6 py-3 rounded-xl font-semibold">
            <Clock className="h-5 w-5 group-hover:scale-110 transition-transform" />
            Schedule Export
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto glass-card border-0 shadow-2xl backdrop-blur-xl">
        <DialogHeader className="space-y-4 pb-6">
          <div className="flex items-center gap-4">
            <div className="p-4 bg-gradient-to-br from-chart-4/15 to-primary/10 rounded-3xl backdrop-blur-sm border border-chart-4/20 shadow-lg">
              <Clock className="h-8 w-8 text-chart-4" />
            </div>
            <div>
              <DialogTitle className="text-3xl font-bold bg-gradient-to-r from-foreground via-chart-4/80 to-primary/80 bg-clip-text text-transparent">
                Schedule Export
              </DialogTitle>
              <DialogDescription className="text-muted-foreground text-lg font-medium mt-2">
                Set up automated exports with custom schedules
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Basic Information */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="glass-card border-0 shadow-lg">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl font-bold text-foreground flex items-center gap-3">
                  <Settings className="h-6 w-6 text-primary" />
                  Export Details
                </CardTitle>
                <CardDescription className="font-medium">
                  Configure your scheduled export
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <Label
                      htmlFor="schedule-name"
                      className="text-sm font-bold text-foreground"
                    >
                      Schedule Name *
                    </Label>
                    <Input
                      id="schedule-name"
                      value={scheduleName}
                      onChange={(e) => setScheduleName(e.target.value)}
                      placeholder="Daily Waitlist Export"
                      className="rounded-xl border-border/50 bg-background/60 backdrop-blur-sm font-medium"
                    />
                  </div>

                  <div className="space-y-3">
                    <Label
                      htmlFor="data-source"
                      className="text-sm font-bold text-foreground"
                    >
                      Data Source *
                    </Label>
                    <Select
                      value={selectedDataSource}
                      onValueChange={setSelectedDataSource}
                    >
                      <SelectTrigger className="rounded-xl border-border/50 bg-background/60 backdrop-blur-sm font-medium">
                        <SelectValue placeholder="Select data source" />
                      </SelectTrigger>
                      <SelectContent>
                        {dataSources.map((source) => (
                          <SelectItem key={source.id} value={source.id}>
                            {source.name} ({source.data.length} records)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-3">
                  <Label
                    htmlFor="description"
                    className="text-sm font-bold text-foreground"
                  >
                    Description
                  </Label>
                  <Textarea
                    id="description"
                    value={scheduleDescription}
                    onChange={(e) => setScheduleDescription(e.target.value)}
                    placeholder="Optional description for this scheduled export"
                    className="rounded-xl border-border/50 bg-background/60 backdrop-blur-sm font-medium min-h-[80px]"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <Label
                      htmlFor="export-format"
                      className="text-sm font-bold text-foreground"
                    >
                      Export Format
                    </Label>
                    <Select
                      value={exportFormat}
                      onValueChange={(value: any) => setExportFormat(value)}
                    >
                      <SelectTrigger className="rounded-xl border-border/50 bg-background/60 backdrop-blur-sm font-medium">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="csv">CSV Format</SelectItem>
                        <SelectItem value="xlsx">Excel Format</SelectItem>
                        <SelectItem value="pdf">PDF Format</SelectItem>
                        <SelectItem value="json">JSON Format</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-3">
                    <Label
                      htmlFor="filename"
                      className="text-sm font-bold text-foreground"
                    >
                      Filename
                    </Label>
                    <Input
                      id="filename"
                      value={filename}
                      onChange={(e) => setFilename(e.target.value)}
                      placeholder="Auto-generated from schedule name"
                      className="rounded-xl border-border/50 bg-background/60 backdrop-blur-sm font-medium"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-muted/30 rounded-2xl border border-border/50">
                  <div className="space-y-1">
                    <Label className="text-sm font-bold text-foreground">
                      Include Headers
                    </Label>
                    <p className="text-xs text-muted-foreground font-medium">
                      Add column names to exported files
                    </p>
                  </div>
                  <Switch
                    checked={includeHeaders}
                    onCheckedChange={setIncludeHeaders}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Schedule Configuration */}
            <Card className="glass-card border-0 shadow-lg">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl font-bold text-foreground flex items-center gap-3">
                  <Repeat className="h-6 w-6 text-primary" />
                  Schedule Configuration
                </CardTitle>
                <CardDescription className="font-medium">
                  Set when and how often to export
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <Label className="text-sm font-bold text-foreground">
                    Schedule Type
                  </Label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {scheduleTypes.map((type) => (
                      <div
                        key={type.value}
                        className={`p-4 rounded-2xl border-2 cursor-pointer transition-all duration-300 ${
                          scheduleType === type.value
                            ? "border-primary/30 bg-primary/5 shadow-md"
                            : "border-border/50 hover:border-border hover:bg-muted/30"
                        }`}
                        onClick={() => setScheduleType(type.value as any)}
                      >
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-4 h-4 rounded-full border-2 ${
                                scheduleType === type.value
                                  ? "border-primary bg-primary"
                                  : "border-muted-foreground"
                              }`}
                            >
                              {scheduleType === type.value && (
                                <div className="w-2 h-2 bg-white rounded-full m-0.5"></div>
                              )}
                            </div>
                            <span className="font-bold text-foreground">
                              {type.label}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground font-medium">
                            {type.description}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <Label
                      htmlFor="schedule-time"
                      className="text-sm font-bold text-foreground"
                    >
                      Time
                    </Label>
                    <Input
                      id="schedule-time"
                      type="time"
                      value={scheduleTime}
                      onChange={(e) => setScheduleTime(e.target.value)}
                      className="rounded-xl border-border/50 bg-background/60 backdrop-blur-sm font-medium"
                    />
                  </div>

                  {scheduleType === "weekly" && (
                    <div className="space-y-3">
                      <Label
                        htmlFor="day-of-week"
                        className="text-sm font-bold text-foreground"
                      >
                        Day of Week
                      </Label>
                      <Select
                        value={scheduleDayOfWeek.toString()}
                        onValueChange={(value) =>
                          setScheduleDayOfWeek(Number(value))
                        }
                      >
                        <SelectTrigger className="rounded-xl border-border/50 bg-background/60 backdrop-blur-sm font-medium">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {weekDays.map((day) => (
                            <SelectItem
                              key={day.value}
                              value={day.value.toString()}
                            >
                              {day.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {scheduleType === "monthly" && (
                    <div className="space-y-3">
                      <Label
                        htmlFor="day-of-month"
                        className="text-sm font-bold text-foreground"
                      >
                        Day of Month
                      </Label>
                      <Input
                        id="day-of-month"
                        type="number"
                        min="1"
                        max="31"
                        value={scheduleDayOfMonth}
                        onChange={(e) =>
                          setScheduleDayOfMonth(Number(e.target.value))
                        }
                        className="rounded-xl border-border/50 bg-background/60 backdrop-blur-sm font-medium"
                      />
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <Label
                    htmlFor="timezone"
                    className="text-sm font-bold text-foreground"
                  >
                    Timezone
                  </Label>
                  <Input
                    id="timezone"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    placeholder="UTC"
                    className="rounded-xl border-border/50 bg-background/60 backdrop-blur-sm font-medium"
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Preview & Settings */}
          <div className="lg:col-span-1 space-y-6">
            {/* Schedule Preview */}
            <Card className="glass-card border-0 shadow-lg">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl font-bold text-foreground flex items-center gap-3">
                  <Timer className="h-6 w-6 text-primary" />
                  Schedule Preview
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-muted-foreground">
                      Type
                    </span>
                    <Badge
                      variant="outline"
                      className="bg-primary/10 text-primary border-primary/30 font-semibold px-3 py-1"
                    >
                      {
                        scheduleTypes.find((t) => t.value === scheduleType)
                          ?.label
                      }
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-muted-foreground">
                      Time
                    </span>
                    <span className="text-sm font-bold text-foreground">
                      {scheduleTime}
                    </span>
                  </div>

                  {scheduleType === "weekly" && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-muted-foreground">
                        Day
                      </span>
                      <span className="text-sm font-bold text-foreground">
                        {
                          weekDays.find((d) => d.value === scheduleDayOfWeek)
                            ?.label
                        }
                      </span>
                    </div>
                  )}

                  {scheduleType === "monthly" && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-muted-foreground">
                        Date
                      </span>
                      <span className="text-sm font-bold text-foreground">
                        {scheduleDayOfMonth}
                      </span>
                    </div>
                  )}

                  <Separator />

                  <div className="space-y-2">
                    <span className="text-sm font-semibold text-muted-foreground">
                      Next Run
                    </span>
                    <div className="p-3 bg-chart-4/10 rounded-xl border border-chart-4/20">
                      <p className="text-sm font-bold text-chart-4">
                        {nextRun.toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {selectedSource && (
                    <div className="space-y-2">
                      <span className="text-sm font-semibold text-muted-foreground">
                        Data Source
                      </span>
                      <div className="p-3 bg-secondary/10 rounded-xl border border-secondary/20">
                        <p className="text-sm font-bold text-secondary">
                          {selectedSource.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {selectedSource.data.length} records
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Schedule Status */}
            <Card className="glass-card border-0 shadow-lg">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl font-bold text-foreground flex items-center gap-3">
                  <Zap className="h-6 w-6 text-primary" />
                  Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between p-4 bg-muted/30 rounded-2xl border border-border/50">
                  <div className="space-y-1">
                    <Label className="text-sm font-bold text-foreground">
                      Active Schedule
                    </Label>
                    <p className="text-xs text-muted-foreground font-medium">
                      {isActive
                        ? "Schedule will run automatically"
                        : "Schedule is paused"}
                    </p>
                  </div>
                  <Switch checked={isActive} onCheckedChange={setIsActive} />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-6 border-t border-border/50">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <Bell className="h-5 w-5 text-primary" />
                <span className="font-bold text-foreground text-lg">
                  Create Schedule
                </span>
              </div>
              <p className="text-sm text-muted-foreground font-medium">
                {scheduleName
                  ? `"${scheduleName}" will be created`
                  : "Enter a schedule name to continue"}
              </p>
            </div>

            <div className="flex gap-4">
              <Button
                variant="outline"
                onClick={() => setIsOpen(false)}
                className="rounded-xl border-border/50 hover:bg-muted/50 font-semibold px-6 py-3"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateSchedule}
                disabled={!scheduleName || !selectedDataSource}
                className="bg-gradient-to-r from-chart-4 to-chart-4/90 hover:from-chart-4/90 hover:to-chart-4/80 text-white shadow-xl hover:shadow-2xl transition-all duration-300 gap-3 group px-6 py-3 rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="h-5 w-5 group-hover:scale-110 transition-transform" />
                Create Schedule
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
