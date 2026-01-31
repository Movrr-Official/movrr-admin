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
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Download,
  FileText,
  FileSpreadsheet,
  FileImage,
  Database,
  Calendar,
  Filter,
  Settings,
  Eye,
  Clock,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Info,
} from "lucide-react";
import {
  exportData,
  getAvailableFields,
  formatFieldName,
  type ExportOptions,
  type ExportableData,
} from "@/lib/export";

interface ExportDialogProps {
  data: ExportableData[];
  trigger?: React.ReactNode;
  defaultFilename?: string;
  title?: string;
  description?: string;
  formats?: Array<"csv" | "xlsx" | "pdf" | "json">; // New optional prop
}

// Available format options
const allFormatOptions = [
  {
    value: "csv" as const,
    label: "CSV",
    description: "Comma-separated values for spreadsheets",
    icon: FileText,
    color: "text-green-600",
    bgColor: "bg-green-50 dark:bg-green-950",
    borderColor: "border-green-200 dark:border-green-800",
  },
  {
    value: "xlsx" as const,
    label: "Excel",
    description: "Microsoft Excel format with styling",
    icon: FileSpreadsheet,
    color: "text-blue-600",
    bgColor: "bg-blue-50 dark:bg-blue-950",
    borderColor: "border-blue-200 dark:border-blue-800",
  },
  {
    value: "pdf" as const,
    label: "PDF",
    description: "Formatted document for sharing",
    icon: FileImage,
    color: "text-red-600",
    bgColor: "bg-red-50 dark:bg-red-950",
    borderColor: "border-red-200 dark:border-red-800",
  },
  {
    value: "json" as const,
    label: "JSON",
    description: "Structured data for developers",
    icon: Database,
    color: "text-purple-600",
    bgColor: "bg-purple-50 dark:bg-purple-950",
    borderColor: "border-purple-200 dark:border-purple-800",
  },
];

export function ExportDialog({
  data,
  trigger,
  defaultFilename = "export",
  title = "Export Data",
  description = "Configure your export settings",
  formats = ["csv", "xlsx", "pdf", "json"], // Default to all formats
}: ExportDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<
    "csv" | "xlsx" | "pdf" | "json"
  >(formats[0] || "csv"); // Default to first available format
  const [filename, setFilename] = useState(defaultFilename);
  const [includeHeaders, setIncludeHeaders] = useState(true);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: "",
    end: "",
  });
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);

  // Filter available formats based on the formats prop
  const formatOptions = allFormatOptions.filter((option) =>
    formats.includes(option.value)
  );

  const availableFields = getAvailableFields(data);

  // Initialize selected fields when data changes
  useEffect(() => {
    if (availableFields.length > 0 && selectedFields.length === 0) {
      setSelectedFields(availableFields);
    }
  }, [availableFields, selectedFields.length]);

  // Update selected format if the current one is not in available formats
  useEffect(() => {
    if (!formats.includes(selectedFormat) && formats.length > 0) {
      setSelectedFormat(formats[0]);
    }
  }, [formats, selectedFormat]);

  const handleFieldToggle = (field: string) => {
    setSelectedFields((prev) =>
      prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field]
    );
  };

  const handleSelectAll = () => {
    setSelectedFields(availableFields);
  };

  const handleDeselectAll = () => {
    setSelectedFields([]);
  };

  const handleExport = async () => {
    if (selectedFields.length === 0) {
      return;
    }

    setIsExporting(true);
    setExportSuccess(false);

    try {
      const options: ExportOptions = {
        format: selectedFormat,
        filename,
        includeHeaders,
        selectedFields,
        ...(dateRange.start &&
          dateRange.end && {
            dateRange: {
              start: new Date(dateRange.start),
              end: new Date(dateRange.end),
            },
          }),
      };

      await exportData(data, options);
      setExportSuccess(true);

      // Auto-close dialog after successful export
      setTimeout(() => {
        setIsOpen(false);
        setExportSuccess(false);
      }, 2000);
    } catch (error) {
      console.error("Export failed:", error);
    } finally {
      setIsExporting(false);
    }
  };

  const selectedFormatOption = formatOptions.find(
    (option) => option.value === selectedFormat
  );
  const filteredDataCount =
    dateRange.start && dateRange.end
      ? data.filter((row) => {
          const rowDate = new Date(row.created_at || row.date || "");
          return (
            rowDate >= new Date(dateRange.start) &&
            rowDate <= new Date(dateRange.end)
          );
        }).length
      : data.length;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary/80 text-primary-foreground shadow-xl hover:shadow-2xl transition-all duration-300 gap-3 group px-6 py-3 rounded-xl font-semibold">
            <Download className="h-5 w-5 group-hover:scale-110 transition-transform" />
            Export Data
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-5xl h-[90vh] flex flex-col glass-card border-0 backdrop-blur-xl p-0 overflow-hidden">
        <div className="flex-1 p-6 overflow-y-auto">
          <DialogHeader className="space-y-4 pb-6">
            <div className="flex items-center gap-4">
              <div className="p-4 bg-gradient-to-br from-primary/15 to-secondary/10 rounded-3xl backdrop-blur-sm border border-primary/20 shadow-lg">
                <Download className="h-8 w-8 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-3xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                  {title}
                </DialogTitle>
                <DialogDescription className="text-muted-foreground text-lg font-medium mt-2">
                  {description}
                </DialogDescription>
              </div>
            </div>

            <div className="flex items-center gap-4 p-4 bg-card/60 backdrop-blur-sm rounded-2xl border border-border/50">
              <div className="flex items-center gap-2">
                <Database className="h-5 w-5 text-primary" />
                <span className="font-semibold text-foreground">
                  {data.length} total records
                </span>
              </div>
              {filteredDataCount !== data.length && (
                <>
                  <Separator orientation="vertical" className="h-6" />
                  <div className="flex items-center gap-2">
                    <Filter className="h-5 w-5 text-secondary" />
                    <span className="font-semibold text-secondary">
                      {filteredDataCount} filtered
                    </span>
                  </div>
                </>
              )}
            </div>
          </DialogHeader>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Format Selection */}
            <div className="lg:col-span-1 space-y-6">
              <Card className="glass-card border-0">
                <CardHeader className="pb-4">
                  <CardTitle className="text-xl font-bold text-foreground flex items-center gap-3">
                    <Settings className="h-6 w-6 text-primary" />
                    Export Format
                  </CardTitle>
                  <CardDescription className="font-medium">
                    Choose your preferred file format
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {formatOptions.map((option) => {
                    const Icon = option.icon;
                    return (
                      <div
                        key={option.value}
                        className={`p-4 rounded-2xl border-2 cursor-pointer transition-all duration-300 ${
                          selectedFormat === option.value
                            ? `${option.bgColor} ${option.borderColor} scale-105`
                            : "border-border/50 hover:border-border hover:bg-muted/30"
                        }`}
                        onClick={() => setSelectedFormat(option.value)}
                      >
                        <div className="flex items-center gap-4">
                          <div
                            className={`p-3 rounded-xl ${selectedFormat === option.value ? "bg-white/80 dark:bg-black/20" : "bg-muted/50"}`}
                          >
                            <Icon
                              className={`h-6 w-6 ${selectedFormat === option.value ? option.color : "text-muted-foreground"}`}
                            />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-foreground text-lg">
                                {option.label}
                              </span>
                              {selectedFormat === option.value && (
                                <CheckCircle2 className="h-5 w-5 text-primary" />
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground font-medium mt-1">
                              {option.description}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              {/* Export Settings */}
              <Card className="glass-card border-0">
                <CardHeader className="pb-4">
                  <CardTitle className="text-xl font-bold text-foreground flex items-center gap-3">
                    <Sparkles className="h-6 w-6 text-primary" />
                    Settings
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
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
                      placeholder="Enter filename"
                      className="rounded-xl border-border/50 bg-background/60 backdrop-blur-sm font-medium"
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 bg-muted/30 rounded-2xl border border-border/50">
                    <div className="space-y-1">
                      <Label className="text-sm font-bold text-foreground">
                        Include Headers
                      </Label>
                      <p className="text-xs text-muted-foreground font-medium">
                        Add column names to export
                      </p>
                    </div>
                    <Switch
                      checked={includeHeaders}
                      onCheckedChange={setIncludeHeaders}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Field Selection & Date Range */}
            <div className="lg:col-span-2 space-y-6">
              {/* Date Range Filter */}
              <Card className="glass-card border-0">
                <CardHeader className="pb-4">
                  <CardTitle className="text-xl font-bold text-foreground flex items-center gap-3">
                    <Calendar className="h-6 w-6 text-primary" />
                    Date Range Filter
                  </CardTitle>
                  <CardDescription className="font-medium">
                    Optional: Filter data by date range
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                          setDateRange((prev) => ({
                            ...prev,
                            end: e.target.value,
                          }))
                        }
                        className="rounded-xl border-border/50 bg-background/60 backdrop-blur-sm font-medium"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Field Selection */}
              <Card className="glass-card border-0">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-xl font-bold text-foreground flex items-center gap-3">
                        <Eye className="h-6 w-6 text-primary" />
                        Select Fields
                      </CardTitle>
                      <CardDescription className="font-medium">
                        Choose which columns to include in export
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleSelectAll}
                        className="border-primary/30 hover:bg-primary/10 hover:text-primary font-semibold bg-transparent"
                      >
                        Select All
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDeselectAll}
                        className="border-destructive/30 hover:bg-destructive/10 hover:text-destructive font-semibold bg-transparent"
                      >
                        Clear All
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {availableFields.map((field) => (
                      <div
                        key={field}
                        className={`flex items-center space-x-3 p-4 rounded-2xl border-2 transition-all duration-300 cursor-pointer ${
                          selectedFields.includes(field)
                            ? "border-primary/30 bg-primary/5"
                            : "border-border/50 hover:border-border hover:bg-muted/30"
                        }`}
                        onClick={() => handleFieldToggle(field)}
                      >
                        <Checkbox
                          id={field}
                          checked={selectedFields.includes(field)}
                          onCheckedChange={() => handleFieldToggle(field)}
                          className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                        />
                        <div className="flex-1">
                          <Label
                            htmlFor={field}
                            className="text-sm font-bold text-foreground cursor-pointer"
                          >
                            {formatFieldName(field)}
                          </Label>
                          <p className="text-xs text-muted-foreground font-medium">
                            {field}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {selectedFields.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <AlertCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p className="font-bold text-lg mb-1">
                        No fields selected
                      </p>
                      <p className="text-sm">
                        Please select at least one field to export
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Export Preview & Action */}
          <div className="pt-6 border-t border-border/50">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <Info className="h-5 w-5 text-primary" />
                  <span className="font-bold text-foreground text-lg">
                    Export Preview
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <Badge
                    variant="outline"
                    className="bg-primary/10 text-primary border-primary/30 font-semibold px-3 py-1"
                  >
                    {selectedFormatOption?.label} Format
                  </Badge>
                  <Badge
                    variant="outline"
                    className="bg-secondary/10 text-secondary border-secondary/30 font-semibold px-3 py-1"
                  >
                    {selectedFields.length} Fields
                  </Badge>
                  <Badge
                    variant="outline"
                    className="bg-chart-3/10 text-chart-3 border-chart-3/30 font-semibold px-3 py-1"
                  >
                    {filteredDataCount} Records
                  </Badge>
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleExport}
                  disabled={selectedFields.length === 0 || isExporting}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground transition-all duration-300 gap-2 flex-1 sm:flex-initial group"
                >
                  {isExporting ? (
                    <>
                      <Clock className="h-5 w-5 animate-spin" />
                      Exporting...
                    </>
                  ) : exportSuccess ? (
                    <>
                      <CheckCircle2 className="h-5 w-5" />
                      Export Complete!
                    </>
                  ) : (
                    <>
                      <Download className="h-5 w-5 group-hover:scale-110 transition-transform" />
                      Export {selectedFormatOption?.label}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
