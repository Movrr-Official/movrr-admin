"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Clock, Play, Pause, Trash2, Edit, Calendar, CheckCircle2, AlertCircle, Timer } from "lucide-react"

interface ScheduledExport {
  id: string
  name: string
  description?: string
  dataSourceId: string
  exportOptions: {
    format: "csv" | "xlsx" | "pdf" | "json"
    filename: string
    includeHeaders: boolean
  }
  schedule: {
    type: "once" | "daily" | "weekly" | "monthly"
    time: string
    dayOfWeek?: number
    dayOfMonth?: number
    timezone: string
  }
  isActive: boolean
  createdAt: Date
  lastRun?: Date
  nextRun: Date
  runCount: number
}

interface ScheduleManagerProps {
  schedules: ScheduledExport[]
  onToggleSchedule?: (id: string, isActive: boolean) => void
  onDeleteSchedule?: (id: string) => void
  onEditSchedule?: (id: string) => void
  onRunNow?: (id: string) => void
}

const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

export function ScheduleManager({
  schedules,
  onToggleSchedule,
  onDeleteSchedule,
  onEditSchedule,
  onRunNow,
}: ScheduleManagerProps) {
  const [selectedSchedule, setSelectedSchedule] = useState<string | null>(null)

  const getScheduleDescription = (schedule: ScheduledExport["schedule"]) => {
    switch (schedule.type) {
      case "once":
        return `Once at ${schedule.time}`
      case "daily":
        return `Daily at ${schedule.time}`
      case "weekly":
        return `Weekly on ${weekDays[schedule.dayOfWeek || 0]} at ${schedule.time}`
      case "monthly":
        return `Monthly on day ${schedule.dayOfMonth} at ${schedule.time}`
      default:
        return "Unknown schedule"
    }
  }

  const getStatusBadge = (schedule: ScheduledExport) => {
    if (!schedule.isActive) {
      return (
        <Badge variant="outline" className="bg-muted text-muted-foreground border-border font-semibold">
          <Pause className="h-3 w-3 mr-1" />
          Paused
        </Badge>
      )
    }

    const now = new Date()
    const isOverdue = schedule.nextRun < now

    if (isOverdue) {
      return (
        <Badge
          variant="outline"
          className="bg-red-50 text-red-700 border-red-200 font-semibold dark:bg-red-950 dark:text-red-300 dark:border-red-800"
        >
          <AlertCircle className="h-3 w-3 mr-1" />
          Overdue
        </Badge>
      )
    }

    return (
      <Badge
        variant="outline"
        className="bg-green-50 text-green-700 border-green-200 font-semibold dark:bg-green-950 dark:text-green-300 dark:border-green-800"
      >
        <CheckCircle2 className="h-3 w-3 mr-1" />
        Active
      </Badge>
    )
  }

  const getFormatBadge = (format: string) => {
    const colors = {
      csv: "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800",
      xlsx: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
      pdf: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800",
      json: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800",
    }

    return (
      <Badge variant="outline" className={`font-semibold ${colors[format as keyof typeof colors] || colors.csv}`}>
        {format.toUpperCase()}
      </Badge>
    )
  }

  return (
    <Card className="glass-card border-0 shadow-xl">
      <CardHeader className="pb-6">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-2xl font-bold text-foreground flex items-center gap-3">
              <Timer className="h-7 w-7 text-primary" />
              Scheduled Exports
            </CardTitle>
            <CardDescription className="text-muted-foreground font-medium mt-2">
              Manage your automated export schedules
            </CardDescription>
          </div>
          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 font-semibold px-4 py-2">
            {schedules.length} schedules
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {schedules.length === 0 ? (
          <div className="text-center py-16 bg-muted/10 rounded-2xl border-2 border-dashed border-border/50">
            <Clock className="h-20 w-20 mx-auto text-muted-foreground/50 mb-6" />
            <p className="font-bold text-foreground text-xl mb-3">No scheduled exports</p>
            <p className="text-muted-foreground font-medium">Create your first scheduled export to get started</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-border/50 overflow-hidden bg-card/40 backdrop-blur-sm shadow-lg">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-border/30 bg-muted/20">
                  <TableHead className="font-bold text-foreground py-4 px-6">Schedule</TableHead>
                  <TableHead className="font-bold text-foreground py-4 px-6">Format</TableHead>
                  <TableHead className="font-bold text-foreground py-4 px-6">Frequency</TableHead>
                  <TableHead className="font-bold text-foreground py-4 px-6">Next Run</TableHead>
                  <TableHead className="font-bold text-foreground py-4 px-6">Status</TableHead>
                  <TableHead className="font-bold text-foreground py-4 px-6">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedules.map((schedule) => (
                  <TableRow key={schedule.id} className="hover:bg-muted/20 transition-colors border-border/20 group">
                    <TableCell className="py-4 px-6">
                      <div className="space-y-1">
                        <p className="font-bold text-foreground">{schedule.name}</p>
                        {schedule.description && (
                          <p className="text-sm text-muted-foreground font-medium">{schedule.description}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Created {schedule.createdAt.toLocaleDateString()} • {schedule.runCount} runs
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="py-4 px-6">{getFormatBadge(schedule.exportOptions.format)}</TableCell>
                    <TableCell className="py-4 px-6">
                      <div className="space-y-1">
                        <p className="font-semibold text-foreground">{getScheduleDescription(schedule.schedule)}</p>
                        <p className="text-xs text-muted-foreground">{schedule.schedule.timezone}</p>
                      </div>
                    </TableCell>
                    <TableCell className="py-4 px-6">
                      <div className="space-y-1">
                        <p className="font-semibold text-foreground">{schedule.nextRun.toLocaleDateString()}</p>
                        <p className="text-sm text-muted-foreground">
                          {schedule.nextRun.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="py-4 px-6">{getStatusBadge(schedule)}</TableCell>
                    <TableCell className="py-4 px-6">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onToggleSchedule?.(schedule.id, !schedule.isActive)}
                          className="hover:bg-primary/10 hover:text-primary transition-colors rounded-xl p-2"
                        >
                          {schedule.isActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onRunNow?.(schedule.id)}
                          className="hover:bg-secondary/10 hover:text-secondary transition-colors rounded-xl p-2"
                        >
                          <Calendar className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onEditSchedule?.(schedule.id)}
                          className="hover:bg-chart-3/10 hover:text-chart-3 transition-colors rounded-xl p-2"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onDeleteSchedule?.(schedule.id)}
                          className="hover:bg-red-50 hover:text-red-600 transition-colors rounded-xl p-2"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
