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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Package,
  Database,
  Calendar,
  Settings,
  Play,
  CheckCircle2,
  AlertCircle,
  Clock,
  Layers,
  FileStack,
  Zap,
  BarChart3,
} from "lucide-react";
import {
  exportData,
  type ExportOptions,
  type ExportableData,
} from "@/lib/export";

interface DataSource {
  id: string;
  name: string;
  description: string;
  data: ExportableData[];
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
  borderColor: string;
}

interface BatchExportDialogProps {
  dataSources: DataSource[];
  trigger?: React.ReactNode;
  title?: string;
  description?: string;
}

interface BatchExportProgress {
  sourceId: string;
  status: "pending" | "processing" | "completed" | "error";
  progress: number;
  filename?: string;
  error?: string;
}

export function BatchExportDialog({
  dataSources,
  trigger,
  title = "Batch Export",
  description = "Export multiple datasets simultaneously",
}: BatchExportDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [selectedFormat, setSelectedFormat] = useState<
    "csv" | "xlsx" | "pdf" | "json"
  >("csv");
  const [includeHeaders, setIncludeHeaders] = useState(true);
  const [filenamePrefix, setFilenamePrefix] = useState("batch_export");
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: "",
    end: "",
  });
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<BatchExportProgress[]>(
    []
  );
  const [exportComplete, setExportComplete] = useState(false);

  // Initialize progress tracking when sources are selected
  useEffect(() => {
    if (selectedSources.length > 0) {
      setExportProgress(
        selectedSources.map((sourceId) => ({
          sourceId,
          status: "pending",
          progress: 0,
        }))
      );
    }
  }, [selectedSources]);

  const handleSourceToggle = (sourceId: string) => {
    setSelectedSources((prev) =>
      prev.includes(sourceId)
        ? prev.filter((id) => id !== sourceId)
        : [...prev, sourceId]
    );
  };

  const handleSelectAll = () => {
    setSelectedSources(dataSources.map((source) => source.id));
  };

  const handleDeselectAll = () => {
    setSelectedSources([]);
  };

  const simulateProgress = (sourceId: string, duration: number) => {
    return new Promise<void>((resolve) => {
      let progress = 0;
      const interval = setInterval(() => {
        progress += Math.random() * 15 + 5; // Random progress increment
        if (progress >= 100) {
          progress = 100;
          clearInterval(interval);
          setExportProgress((prev) =>
            prev.map((item) =>
              item.sourceId === sourceId
                ? { ...item, status: "completed", progress: 100 }
                : item
            )
          );
          resolve();
        } else {
          setExportProgress((prev) =>
            prev.map((item) =>
              item.sourceId === sourceId
                ? { ...item, status: "processing", progress }
                : item
            )
          );
        }
      }, duration / 20); // Complete in specified duration
    });
  };

  const handleBatchExport = async () => {
    if (selectedSources.length === 0) return;

    setIsExporting(true);
    setExportComplete(false);

    try {
      const selectedDataSources = dataSources.filter((source) =>
        selectedSources.includes(source.id)
      );

      // Initialize progress
      setExportProgress(
        selectedSources.map((sourceId) => ({
          sourceId,
          status: "pending",
          progress: 0,
        }))
      );

      // Process exports sequentially with progress simulation
      for (const source of selectedDataSources) {
        setExportProgress((prev) =>
          prev.map((item) =>
            item.sourceId === source.id
              ? { ...item, status: "processing", progress: 0 }
              : item
          )
        );

        // Simulate export progress
        await simulateProgress(source.id, 2000 + Math.random() * 2000); // 2-4 seconds per export

        // Perform actual export
        const options: ExportOptions = {
          format: selectedFormat,
          filename: `${filenamePrefix}_${source.name.toLowerCase().replace(/\s+/g, "_")}`,
          includeHeaders,
          ...(dateRange.start &&
            dateRange.end && {
              dateRange: {
                start: new Date(dateRange.start),
                end: new Date(dateRange.end),
              },
            }),
        };

        await exportData(source.data, options);

        setExportProgress((prev) =>
          prev.map((item) =>
            item.sourceId === source.id
              ? {
                  ...item,
                  status: "completed",
                  progress: 100,
                  filename: `${options.filename}.${selectedFormat}`,
                }
              : item
          )
        );
      }

      setExportComplete(true);

      // Auto-close dialog after successful batch export
      setTimeout(() => {
        setIsOpen(false);
        setExportComplete(false);
        setExportProgress([]);
      }, 3000);
    } catch (error) {
      console.error("Batch export failed:", error);
      setExportProgress((prev) =>
        prev.map((item) => ({
          ...item,
          status: "error",
          error: "Export failed",
        }))
      );
    } finally {
      setIsExporting(false);
    }
  };

  const totalProgress =
    exportProgress.length > 0
      ? exportProgress.reduce((sum, item) => sum + item.progress, 0) /
        exportProgress.length
      : 0;

  const completedExports = exportProgress.filter(
    (item) => item.status === "completed"
  ).length;
  const totalSelectedSources = selectedSources.length;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="bg-gradient-to-r from-secondary to-secondary/90 hover:from-secondary/90 hover:to-secondary/80 text-secondary-foreground shadow-xl hover:shadow-2xl transition-all duration-300 gap-3 group px-6 py-3 rounded-xl font-semibold">
            <Package className="h-5 w-5 group-hover:scale-110 transition-transform" />
            Batch Export
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto glass-card border-0 shadow-2xl backdrop-blur-xl">
        <DialogHeader className="space-y-4 pb-6">
          <div className="flex items-center gap-4">
            <div className="p-4 bg-gradient-to-br from-secondary/15 to-primary/10 rounded-3xl backdrop-blur-sm border border-secondary/20 shadow-lg">
              <Package className="h-8 w-8 text-secondary" />
            </div>
            <div>
              <DialogTitle className="text-3xl font-bold bg-gradient-to-r from-foreground via-secondary/80 to-primary/80 bg-clip-text text-transparent">
                {title}
              </DialogTitle>
              <DialogDescription className="text-muted-foreground text-lg font-medium mt-2">
                {description}
              </DialogDescription>
            </div>
          </div>

          <div className="flex items-center gap-4 p-4 bg-card/60 backdrop-blur-sm rounded-2xl border border-border/50">
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-secondary" />
              <span className="font-semibold text-foreground">
                {dataSources.length} available sources
              </span>
            </div>
            <Separator orientation="vertical" className="h-6" />
            <div className="flex items-center gap-2">
              <FileStack className="h-5 w-5 text-primary" />
              <span className="font-semibold text-primary">
                {selectedSources.length} selected
              </span>
            </div>
          </div>
        </DialogHeader>

        {/* Export Progress */}
        {isExporting && (
          <Card className="glass-card border-0 shadow-lg mb-6">
            <CardHeader className="pb-4">
              <CardTitle className="text-xl font-bold text-foreground flex items-center gap-3">
                <Zap className="h-6 w-6 text-primary animate-pulse" />
                Export Progress
              </CardTitle>
              <CardDescription className="font-medium">
                {exportComplete
                  ? "All exports completed successfully!"
                  : `Processing ${completedExports}/${totalSelectedSources} exports...`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">
                    Overall Progress
                  </span>
                  <span className="text-sm font-bold text-primary">
                    {Math.round(totalProgress)}%
                  </span>
                </div>
                <Progress value={totalProgress} className="h-3 rounded-full" />
              </div>

              <div className="space-y-3">
                {exportProgress.map((progress) => {
                  const source = dataSources.find(
                    (s) => s.id === progress.sourceId
                  );
                  if (!source) return null;

                  const Icon = source.icon;
                  return (
                    <div
                      key={progress.sourceId}
                      className="flex items-center gap-4 p-4 bg-muted/30 rounded-2xl border border-border/50"
                    >
                      <div className={`p-3 rounded-xl ${source.bgColor}`}>
                        <Icon className={`h-5 w-5 ${source.color}`} />
                      </div>
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-foreground">
                            {source.name}
                          </span>
                          <div className="flex items-center gap-2">
                            {progress.status === "pending" && (
                              <Clock className="h-4 w-4 text-muted-foreground" />
                            )}
                            {progress.status === "processing" && (
                              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                            )}
                            {progress.status === "completed" && (
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                            )}
                            {progress.status === "error" && (
                              <AlertCircle className="h-4 w-4 text-red-600" />
                            )}
                            <span className="text-sm font-bold text-primary">
                              {Math.round(progress.progress)}%
                            </span>
                          </div>
                        </div>
                        <Progress
                          value={progress.progress}
                          className="h-2 rounded-full"
                        />
                        {progress.filename && (
                          <p className="text-xs text-muted-foreground font-medium">
                            Saved as: {progress.filename}
                          </p>
                        )}
                        {progress.error && (
                          <p className="text-xs text-red-600 font-medium">
                            Error: {progress.error}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Data Source Selection */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="glass-card border-0 shadow-lg">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl font-bold text-foreground flex items-center gap-3">
                      <Database className="h-6 w-6 text-primary" />
                      Select Data Sources
                    </CardTitle>
                    <CardDescription className="font-medium">
                      Choose which datasets to export
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSelectAll}
                      className="rounded-xl border-primary/30 hover:bg-primary/10 hover:text-primary font-semibold bg-transparent"
                    >
                      Select All
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDeselectAll}
                      className="rounded-xl border-border/50 hover:bg-muted/50 font-semibold bg-transparent"
                    >
                      Clear All
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-4">
                  {dataSources.map((source) => {
                    const Icon = source.icon;
                    const isSelected = selectedSources.includes(source.id);
                    return (
                      <div
                        key={source.id}
                        className={`p-6 rounded-2xl border-2 cursor-pointer transition-all duration-300 ${
                          isSelected
                            ? `${source.bgColor} ${source.borderColor} shadow-lg scale-[1.02]`
                            : "border-border/50 hover:border-border hover:bg-muted/30"
                        }`}
                        onClick={() => handleSourceToggle(source.id)}
                      >
                        <div className="flex items-center gap-4">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() =>
                              handleSourceToggle(source.id)
                            }
                            className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                          />
                          <div
                            className={`p-4 rounded-xl ${isSelected ? "bg-white/80 dark:bg-black/20" : "bg-muted/50"}`}
                          >
                            <Icon
                              className={`h-8 w-8 ${isSelected ? source.color : "text-muted-foreground"}`}
                            />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <h3 className="font-bold text-foreground text-xl">
                                {source.name}
                              </h3>
                              <Badge
                                variant="outline"
                                className="bg-primary/10 text-primary border-primary/30 font-semibold px-3 py-1"
                              >
                                {source.data.length} records
                              </Badge>
                            </div>
                            <p className="text-muted-foreground font-medium mt-2">
                              {source.description}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {selectedSources.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                    <Package className="h-16 w-16 mx-auto mb-4 opacity-50" />
                    <p className="font-bold text-lg mb-2">
                      No sources selected
                    </p>
                    <p className="text-sm">
                      Please select at least one data source to export
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Export Settings */}
          <div className="lg:col-span-1 space-y-6">
            <Card className="glass-card border-0 shadow-lg">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl font-bold text-foreground flex items-center gap-3">
                  <Settings className="h-6 w-6 text-primary" />
                  Batch Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  <Label
                    htmlFor="format"
                    className="text-sm font-bold text-foreground"
                  >
                    Export Format
                  </Label>
                  <select
                    id="format"
                    value={selectedFormat}
                    onChange={(e) => setSelectedFormat(e.target.value as any)}
                    className="w-full rounded-xl border border-border/50 bg-background/60 backdrop-blur-sm px-4 py-3 font-medium focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
                  >
                    <option value="csv">CSV Format</option>
                    <option value="xlsx">Excel Format</option>
                    <option value="pdf">PDF Format</option>
                    <option value="json">JSON Format</option>
                  </select>
                </div>

                <div className="space-y-3">
                  <Label
                    htmlFor="prefix"
                    className="text-sm font-bold text-foreground"
                  >
                    Filename Prefix
                  </Label>
                  <Input
                    id="prefix"
                    value={filenamePrefix}
                    onChange={(e) => setFilenamePrefix(e.target.value)}
                    placeholder="batch_export"
                    className="rounded-xl border-border/50 bg-background/60 backdrop-blur-sm font-medium"
                  />
                </div>

                <div className="flex items-center justify-between p-4 bg-muted/30 rounded-2xl border border-border/50">
                  <div className="space-y-1">
                    <Label className="text-sm font-bold text-foreground">
                      Include Headers
                    </Label>
                    <p className="text-xs text-muted-foreground font-medium">
                      Add column names to all exports
                    </p>
                  </div>
                  <Switch
                    checked={includeHeaders}
                    onCheckedChange={setIncludeHeaders}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Date Range Filter */}
            <Card className="glass-card border-0 shadow-lg">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl font-bold text-foreground flex items-center gap-3">
                  <Calendar className="h-6 w-6 text-primary" />
                  Date Filter
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label
                    htmlFor="start-date"
                    className="text-sm font-bold text-foreground"
                  >
                    Start Date
                  </Label>
                  <Input
                    id="start-date"
                    type="date"
                    value={dateRange.start}
                    onChange={(e) =>
                      setDateRange((prev) => ({
                        ...prev,
                        start: e.target.value,
                      }))
                    }
                    className="rounded-xl border-border/50 bg-background/60 backdrop-blur-sm font-medium"
                  />
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="end-date"
                    className="text-sm font-bold text-foreground"
                  >
                    End Date
                  </Label>
                  <Input
                    id="end-date"
                    type="date"
                    value={dateRange.end}
                    onChange={(e) =>
                      setDateRange((prev) => ({ ...prev, end: e.target.value }))
                    }
                    className="rounded-xl border-border/50 bg-background/60 backdrop-blur-sm font-medium"
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Export Action */}
        <div className="pt-6 border-t border-border/50">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <BarChart3 className="h-5 w-5 text-primary" />
                <span className="font-bold text-foreground text-lg">
                  Batch Export Summary
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <Badge
                  variant="outline"
                  className="bg-secondary/10 text-secondary border-secondary/30 font-semibold px-3 py-1"
                >
                  {selectedSources.length} Sources
                </Badge>
                <Badge
                  variant="outline"
                  className="bg-primary/10 text-primary border-primary/30 font-semibold px-3 py-1"
                >
                  {selectedFormat.toUpperCase()} Format
                </Badge>
                <Badge
                  variant="outline"
                  className="bg-chart-3/10 text-chart-3 border-chart-3/30 font-semibold px-3 py-1"
                >
                  {dataSources
                    .filter((source) => selectedSources.includes(source.id))
                    .reduce(
                      (total, source) => total + source.data.length,
                      0
                    )}{" "}
                  Total Records
                </Badge>
              </div>
            </div>

            <div className="flex gap-4">
              <Button
                variant="outline"
                onClick={() => setIsOpen(false)}
                disabled={isExporting}
                className="rounded-xl border-border/50 hover:bg-muted/50 font-semibold px-6 py-3"
              >
                Cancel
              </Button>
              <Button
                onClick={handleBatchExport}
                disabled={selectedSources.length === 0 || isExporting}
                className="bg-gradient-to-r from-secondary to-secondary/90 hover:from-secondary/90 hover:to-secondary/80 text-secondary-foreground shadow-xl hover:shadow-2xl transition-all duration-300 gap-3 group px-6 py-3 rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isExporting ? (
                  <>
                    <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Exporting...
                  </>
                ) : exportComplete ? (
                  <>
                    <CheckCircle2 className="h-5 w-5" />
                    Export Complete!
                  </>
                ) : (
                  <>
                    <Play className="h-5 w-5 group-hover:scale-110 transition-transform" />
                    Start Batch Export
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
