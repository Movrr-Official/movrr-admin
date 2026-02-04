"use client";

import { useMemo, useState, useTransition } from "react";
import { Bell, BellRing, CheckCircle, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/PageHeader";
import { StatsCard } from "@/components/stats/StatsCard";
import { useToast } from "@/hooks/useToast";
import { createNotifications } from "@/app/actions/notifications";
import {
  useNotificationStats,
  useNotificationsHistory,
} from "@/hooks/useNotificationsData";
import {
  NotificationStatusFilter,
  NotificationTarget,
  NotificationType,
  UserRole,
} from "@/schemas";

const notificationTypeLabels: Record<NotificationType, string> = {
  campaign_assigned: "Campaign Assigned",
  campaign_completed: "Campaign Completed",
  route_assigned: "Route Assigned",
  route_completed: "Route Completed",
  system: "System",
  reward: "Reward",
  status: "Status Update",
};

const notificationTypeOptions: Array<{
  value: NotificationType;
  label: string;
}> = Object.entries(notificationTypeLabels).map(([value, label]) => ({
  value: value as NotificationType,
  label,
}));

const targetOptions: Array<{ value: NotificationTarget; label: string }> = [
  { value: "all", label: "All Users" },
  { value: "role", label: "By Role" },
  { value: "userIds", label: "Specific Users" },
];

const roleOptions = [
  { value: "rider", label: "Rider" },
  { value: "advertiser", label: "Advertiser" },
  { value: "government", label: "Government" },
  { value: "admin", label: "Admin" },
  { value: "super_admin", label: "Super Admin" },
  { value: "moderator", label: "Moderator" },
  { value: "support", label: "Support" },
];

const statusOptions: Array<{ value: NotificationStatusFilter; label: string }> =
  [
    { value: "all", label: "All" },
    { value: "read", label: "Read" },
    { value: "unread", label: "Unread" },
  ];

export default function NotificationsOverview() {
  const { toast } = useToast();
  const [isSending, startTransition] = useTransition();

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState<NotificationType>("system");
  const [target, setTarget] = useState<NotificationTarget>("all");
  const [role, setRole] = useState<UserRole>("rider");
  const [userIdsInput, setUserIdsInput] = useState("");
  const [metadataInput, setMetadataInput] = useState("{}");
  const [respectPreferences, setRespectPreferences] = useState(true);

  const [statusFilter, setStatusFilter] =
    useState<NotificationStatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | NotificationType>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filters = useMemo(() => {
    return {
      status: statusFilter === "all" ? undefined : statusFilter,
      type: typeFilter === "all" ? undefined : typeFilter,
      searchQuery: searchQuery.trim() || undefined,
    };
  }, [searchQuery, statusFilter, typeFilter]);

  const { data: stats } = useNotificationStats();
  const {
    data: notifications,
    isLoading: isHistoryLoading,
    refetch: refetchHistory,
  } = useNotificationsHistory(filters);

  const handleSend = () => {
    if (!title.trim() || !message.trim()) {
      toast({
        title: "Missing fields",
        description: "Title and message are required.",
        variant: "destructive",
      });
      return;
    }

    let metadata: Record<string, any> = {};
    try {
      metadata = metadataInput.trim() ? JSON.parse(metadataInput) : {};
    } catch (error) {
      toast({
        title: "Invalid metadata",
        description: "Metadata must be valid JSON.",
        variant: "destructive",
      });
      return;
    }

    const userIds = userIdsInput
      .split(/\s|,|;|\n/)
      .map((id) => id.trim())
      .filter(Boolean);

    startTransition(async () => {
      const result = await createNotifications({
        title: title.trim(),
        message: message.trim(),
        type,
        target,
        role: target === "role" ? role : undefined,
        userIds: target === "userIds" ? userIds : undefined,
        metadata,
        respectPreferences,
      });

      if (!result.success) {
        toast({
          title: "Notification failed",
          description: result.error ?? "Unable to send notification.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Notification sent",
        description: `Sent to ${result.data?.recipientCount ?? 0} recipients.`,
      });

      setTitle("");
      setMessage("");
      setUserIdsInput("");
      setMetadataInput("{}");
      refetchHistory();
    });
  };

  return (
    <div className="min-h-screen gradient-bg px-4 sm:px-6 py-8 md:py-12 lg:py-16 lg:pt-6">
      <div className="space-y-6 md:space-y-8">
        <PageHeader
          title="Notifications"
          description="Create targeted updates for riders, advertisers, and partners. Review delivery status and engagement at a glance."
        />

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatsCard
            title="Total Sent"
            value={stats?.total ?? 0}
            icon={Bell}
            size="mini"
          />
          <StatsCard
            title="Unread"
            value={stats?.unread ?? 0}
            icon={BellRing}
            size="mini"
          />
          <StatsCard
            title="Read"
            value={stats?.read ?? 0}
            icon={CheckCircle}
            size="mini"
          />
          <StatsCard
            title="Last 7 Days"
            value={stats?.last7Days ?? 0}
            icon={Megaphone}
            size="mini"
          />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <Card className="glass-card border-0 xl:col-span-1">
            <CardHeader>
              <CardTitle>Create Notification</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Title</label>
                <Input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Short headline"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Message</label>
                <Textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Write the notification message"
                  rows={4}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Type</label>
                  <Select
                    value={type}
                    onValueChange={(value) =>
                      setType(value as NotificationType)
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {notificationTypeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Target</label>
                  <Select
                    value={target}
                    onValueChange={(value) =>
                      setTarget(value as NotificationTarget)
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select target" />
                    </SelectTrigger>
                    <SelectContent>
                      {targetOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {target === "role" && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Role</label>
                  <Select
                    value={role}
                    onValueChange={(value) => setRole(value as UserRole)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      {roleOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {target === "userIds" && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">User IDs</label>
                  <Textarea
                    value={userIdsInput}
                    onChange={(event) => setUserIdsInput(event.target.value)}
                    placeholder="Paste UUIDs separated by commas or new lines"
                    rows={3}
                  />
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium">Metadata (JSON)</label>
                <Textarea
                  value={metadataInput}
                  onChange={(event) => setMetadataInput(event.target.value)}
                  placeholder='{"campaign_id": "..."}'
                  rows={3}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
                <div>
                  <p className="text-sm font-medium">
                    Respect user preferences
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Skip users who opted out of notifications.
                  </p>
                </div>
                <Switch
                  checked={respectPreferences}
                  onCheckedChange={setRespectPreferences}
                />
              </div>

              <Button
                className="w-full"
                onClick={handleSend}
                disabled={isSending}
              >
                {isSending ? "Sending..." : "Send Notification"}
              </Button>
            </CardContent>
          </Card>

          <Card className="glass-card border-0 xl:col-span-2">
            <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>Notification History</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Track delivery status and engagement across your audience.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Select
                  value={typeFilter}
                  onValueChange={(value) =>
                    setTypeFilter(value as "all" | NotificationType)
                  }
                >
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {notificationTypeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={statusFilter}
                  onValueChange={(value) =>
                    setStatusFilter(value as NotificationStatusFilter)
                  }
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search notifications"
                  className="w-[200px]"
                />
              </div>
            </CardHeader>
            <CardContent>
              {isHistoryLoading ? (
                <p className="text-sm text-muted-foreground">
                  Loading notifications...
                </p>
              ) : notifications && notifications.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Recipient</TableHead>
                      <TableHead>Message</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Sent</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {notifications.map((notification) => (
                      <TableRow key={notification.id}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-sm font-medium">
                              {notification.recipient?.name ||
                                notification.recipient?.email ||
                                notification.userId}
                            </span>
                            {notification.recipient?.email && (
                              <span className="text-xs text-muted-foreground">
                                {notification.recipient.email}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="max-w-[320px] space-y-1">
                            <p className="text-sm font-medium">
                              {notification.title}
                            </p>
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {notification.message}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {notificationTypeLabels[notification.type]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              notification.isRead ? "secondary" : "warning"
                            }
                          >
                            {notification.isRead ? "Read" : "Unread"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {new Date(notification.createdAt).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <p className="text-sm font-medium">No notifications yet</p>
                  <p className="text-xs text-muted-foreground max-w-sm">
                    Create a notification to start engaging riders and partners.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
