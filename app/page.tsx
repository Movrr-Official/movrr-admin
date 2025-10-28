import { createSupabaseServerClient } from "@/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Download,
  Users,
  MapPin,
  Bike,
  User,
  BarChart3,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Filter,
  Search,
  Calendar,
  TrendingUp,
  Activity,
  Sparkles,
} from "lucide-react";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { ExportDialog } from "@/components/export/export-dialog";

interface WaitlistEntry {
  id: string;
  name: string;
  email: string;
  city: string;
  bike_ownership: "yes" | "no" | "planning";
  created_at: string;
}

export default async function AdminDashboard() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/signin?redirectTo=/");
  }

  const { data: adminUser } = await supabase
    .from("admin_users")
    .select("role, email")
    .eq("user_id", user.id)
    .single();

  if (!adminUser) {
    redirect("/unauthorized");
  }

  // Fetch waitlist data
  const { data: waitlistEntries, error } = await supabase
    .from("waitlist")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching waitlist:", error);
  }

  const entries = waitlistEntries || [];

  // Calculate stats
  const totalSignups = entries.length;
  const citiesCount = new Set(entries.map((entry) => entry.city)).size;
  const bikeOwners = entries.filter(
    (entry) => entry.bike_ownership === "yes"
  ).length;
  const planningBike = entries.filter(
    (entry) => entry.bike_ownership === "planning"
  ).length;
  const noBike = entries.filter(
    (entry) => entry.bike_ownership === "no"
  ).length;

  const cityBreakdown = entries.reduce(
    (acc, entry) => {
      acc[entry.city] = (acc[entry.city] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const topCities = Object.entries(cityBreakdown)
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .slice(0, 5);

  // Calculate signups in the last 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recentSignups = entries.filter(
    (entry) => new Date(entry.created_at) >= sevenDaysAgo
  ).length;

  // Calculate daily average
  const oldestSignup =
    entries.length > 0
      ? new Date(entries[entries.length - 1].created_at)
      : new Date();
  const daysSinceLaunch = Math.max(
    1,
    Math.ceil(
      (new Date().getTime() - oldestSignup.getTime()) / (1000 * 60 * 60 * 24)
    )
  );
  const dailyAverage = Math.round(totalSignups / daysSinceLaunch);

  const getBikeOwnershipBadge = (ownership: string) => {
    switch (ownership) {
      case "yes":
        return (
          <Badge className="bg-primary/10 text-primary hover:bg-primary/20 border-primary/20 font-medium">
            <Bike className="h-3 w-3 mr-1" />
            Owns Bike
          </Badge>
        );
      case "no":
        return (
          <Badge
            variant="secondary"
            className="bg-muted text-muted-foreground hover:bg-muted/80 font-medium"
          >
            No Bike
          </Badge>
        );
      case "planning":
        return (
          <Badge
            variant="outline"
            className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 font-medium dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800"
          >
            Planning to Get
          </Badge>
        );
      default:
        return <Badge variant="secondary">{ownership}</Badge>;
    }
  };

  // Function to get the appropriate shield icon based on role
  const getRoleIcon = (role: string) => {
    switch (role.toLowerCase()) {
      case "super_admin":
        return <ShieldAlert className="h-4 w-4 text-red-600" />;
      case "admin":
        return <ShieldCheck className="h-4 w-4 text-primary" />;
      default:
        return <Shield className="h-4 w-4 text-muted-foreground" />;
    }
  };

  // Function to get badge color based on role
  const getRoleBadgeVariant = (role: string) => {
    switch (role.toLowerCase()) {
      case "super_admin":
        return (
          <Badge
            variant="outline"
            className="bg-red-50 text-red-700 border-red-200 font-medium dark:bg-red-950 dark:text-red-300 dark:border-red-800"
          >
            {getRoleIcon(role)}
            <span className="ml-1">{role.replace("_", " ").toUpperCase()}</span>
          </Badge>
        );
      case "admin":
        return (
          <Badge
            variant="outline"
            className="bg-primary/10 text-primary border-primary/20 font-medium"
          >
            {getRoleIcon(role)}
            <span className="ml-1">{role.replace("_", " ").toUpperCase()}</span>
          </Badge>
        );
      default:
        return (
          <Badge
            variant="outline"
            className="bg-muted text-muted-foreground border-border font-medium"
          >
            {getRoleIcon(role)}
            <span className="ml-1">{role.replace("_", " ").toUpperCase()}</span>
          </Badge>
        );
    }
  };

  return (
    <div className="min-h-screen gradient-bg p-4 md:p-6 lg:p-8">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-32 h-32 bg-primary/5 rounded-full blur-3xl animate-float"></div>
        <div
          className="absolute top-40 right-20 w-48 h-48 bg-primary/3 rounded-full blur-3xl animate-float"
          style={{ animationDelay: "2s" }}
        ></div>
        <div
          className="absolute bottom-20 left-1/3 w-40 h-40 bg-primary/4 rounded-full blur-3xl animate-float"
          style={{ animationDelay: "4s" }}
        ></div>
      </div>

      <div className="max-w-7xl mx-auto space-y-6 md:space-y-8 relative z-10">
        {/* Header */}
        <Card className="glass-card border-0 shadow-lg backdrop-blur-xl animate-slide-up">
          <CardContent className="p-6 md:p-8">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="p-3 bg-primary/10 rounded-2xl backdrop-blur-sm border border-primary/20">
                      <BarChart3 className="h-7 w-7 text-primary" />
                    </div>
                    <span className="absolute -top-5 -right-0.5 transform translate-x-0.5 translate-y-4">
                      <span className="block w-4 h-4 bg-primary text-white text-xs px-1.5 py-0.5 rounded-full animate-ping"></span>
                      <span className="block w-3 h-3 bg-primary rounded-full absolute top-0.5 left-0.5 animate-pulse-slow"></span>
                    </span>
                  </div>
                  <div>
                    <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                      MOVRR ADMIN
                    </h1>
                    <div className="flex items-center gap-2 mt-1">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium text-primary">
                        Live Dashboard
                      </span>
                    </div>
                  </div>
                </div>
                <p className="text-muted-foreground text-base max-w-md leading-relaxed">
                  Real-time insights and management for your pre-launch waitlist
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full md:w-auto">
                <div className="flex items-center gap-3 text-sm bg-gray-100 backdrop-blur-sm px-2 py-1.5 rounded-2xl border border-border/50 w-full sm:w-auto">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center">
                      <User className="h-4 w-4 text-primary" />
                    </div>
                    <span className="font-medium truncate max-w-[120px] md:max-w-none">
                      {adminUser.email}
                    </span>
                  </div>
                  {getRoleBadgeVariant(adminUser.role)}
                </div>

                <div className="flex gap-3 w-full sm:w-auto">
                  <div className="flex gap-2">
                    <ExportDialog
                      data={entries}
                      defaultFilename="waitlist_export"
                      title="Export Waitlist Data"
                      description="Export waitlist entries in multiple formats"
                      trigger={
                        <Button
                          size="sm"
                          className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg hover:shadow-xl transition-all duration-300 gap-2 flex-1 sm:flex-initial group"
                        >
                          <Download className="h-4 w-4 group-hover:scale-110 transition-transform" />
                          <span className="hidden sm:inline font-medium">
                            Export Data
                          </span>
                        </Button>
                      }
                    />
                  </div>
                  <SignOutButton />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          <Card className="glass-card border-0 shadow-lg hover:shadow-xl transition-all duration-300 group animate-slide-up overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 relative z-10">
              <CardTitle className="text-sm font-semibold text-muted-foreground">
                Total Signups
              </CardTitle>
              <div className="p-3 bg-blue-100 rounded-xl group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 dark:bg-blue-950">
                <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="text-3xl md:text-4xl font-bold text-foreground mb-2">
                {totalSignups.toLocaleString()}
              </div>
              <div className="flex items-center gap-2 mb-2">
                {recentSignups > 0 && (
                  <>
                    <div className="flex items-center gap-1 px-2 py-1 bg-primary/10 rounded-full">
                      <TrendingUp className="h-3 w-3 text-primary" />
                      <span className="text-xs text-primary font-semibold">
                        +{recentSignups}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      this week
                    </span>
                  </>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {dailyAverage} signups/day average
              </p>
            </CardContent>
          </Card>

          <Card
            className="glass-card border-0 shadow-lg hover:shadow-xl transition-all duration-300 group animate-slide-up overflow-hidden relative"
            style={{ animationDelay: "0.1s" }}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 relative z-10">
              <CardTitle className="text-sm font-semibold text-muted-foreground">
                Active Cities
              </CardTitle>
              <div className="p-3 bg-primary/10 rounded-xl group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                <MapPin className="h-5 w-5 text-primary" />
              </div>
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="text-3xl md:text-4xl font-bold text-foreground mb-2">
                {citiesCount}
              </div>
              <div className="flex items-center gap-1 mb-2">
                <Activity className="h-3 w-3 text-primary" />
                <span className="text-xs text-primary font-semibold">
                  Markets
                </span>
              </div>
              <p className="text-xs text-muted-foreground">Geographic reach</p>
            </CardContent>
          </Card>

          <Card
            className="glass-card border-0 shadow-lg hover:shadow-xl transition-all duration-300 group animate-slide-up overflow-hidden relative"
            style={{ animationDelay: "0.2s" }}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 relative z-10">
              <CardTitle className="text-sm font-semibold text-muted-foreground">
                Bike Owners
              </CardTitle>
              <div className="p-3 bg-purple-100 rounded-xl group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 dark:bg-purple-950">
                <Bike className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="text-3xl md:text-4xl font-bold text-foreground mb-2">
                {bikeOwners}
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                {totalSignups > 0
                  ? Math.round((bikeOwners / totalSignups) * 100)
                  : 0}
                % of signups
              </p>
              <div className="flex gap-2 flex-wrap">
                <Badge
                  variant="outline"
                  className="text-xs bg-primary/10 text-primary border-primary/20 font-medium"
                >
                  {planningBike} planning
                </Badge>
                <Badge
                  variant="outline"
                  className="text-xs bg-muted text-muted-foreground border-border font-medium"
                >
                  {noBike} no bike
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card
            className="glass-card border-0 shadow-lg hover:shadow-xl transition-all duration-300 group animate-slide-up overflow-hidden relative"
            style={{ animationDelay: "0.3s" }}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 relative z-10">
              <CardTitle className="text-sm font-semibold text-muted-foreground">
                Growth Rate
              </CardTitle>
              <div className="p-3 bg-amber-100 rounded-xl group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 dark:bg-amber-950">
                <Calendar className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="text-3xl md:text-4xl font-bold text-foreground mb-2">
                {dailyAverage}/day
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Average signups
              </p>
              <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-primary to-primary/80 h-2 rounded-full transition-all duration-1000 ease-out"
                  style={{
                    width: `${Math.min(100, (recentSignups / Math.max(1, dailyAverage * 7)) * 100)}%`,
                  }}
                ></div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
          {/* Top Cities */}
          <Card
            className="lg:col-span-1 glass-card border-0 shadow-lg animate-slide-up"
            style={{ animationDelay: "0.4s" }}
          >
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-xl font-bold">
                    Top Cities
                  </CardTitle>
                  <CardDescription className="text-muted-foreground">
                    Cities with the most signups
                  </CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="hover:bg-primary/10 hover:text-primary transition-colors"
                >
                  <Filter className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {topCities.map(([city, count], index) => (
                  <div
                    key={city}
                    className="flex items-center justify-between group hover:bg-muted/50 p-3 rounded-xl transition-all duration-200 cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gradient-to-br from-primary to-primary/80 rounded-full flex items-center justify-center text-sm font-bold text-primary-foreground group-hover:scale-110 transition-transform shadow-md">
                        {index + 1}
                      </div>
                      <span className="font-semibold text-foreground">
                        {city}
                      </span>
                    </div>
                    <Badge
                      variant="secondary"
                      className="bg-primary/10 text-primary border-primary/20 font-semibold px-3 py-1"
                    >
                      {count as number}
                    </Badge>
                  </div>
                ))}
                {topCities.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <MapPin className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="font-medium">No cities yet</p>
                    <p className="text-sm">Waiting for signups</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Waitlist Table */}
          <Card
            className="lg:col-span-2 glass-card border-0 shadow-lg animate-slide-up"
            style={{ animationDelay: "0.5s" }}
          >
            <CardHeader className="pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="space-y-1">
                  <CardTitle className="text-xl font-bold">
                    Waitlist Entries
                  </CardTitle>
                  <CardDescription className="text-muted-foreground">
                    All pre-launch signups ({entries.length} total)
                  </CardDescription>
                </div>
                <div className="flex gap-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                      type="search"
                      placeholder="Search entries..."
                      className="h-9 pl-10 w-full sm:w-[220px] rounded-xl border border-border bg-background/50 backdrop-blur-sm py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    />
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-xl border border-border/50 overflow-hidden bg-card/30 backdrop-blur-sm">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-border/50">
                      <TableHead className="font-bold text-foreground">
                        Name
                      </TableHead>
                      <TableHead className="font-bold text-foreground hidden sm:table-cell">
                        Email
                      </TableHead>
                      <TableHead className="font-bold text-foreground">
                        City
                      </TableHead>
                      <TableHead className="font-bold text-foreground hidden md:table-cell">
                        Bike Status
                      </TableHead>
                      <TableHead className="font-bold text-foreground">
                        Signup Date
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map((entry: WaitlistEntry) => (
                      <TableRow
                        key={entry.id}
                        className="hover:bg-muted/30 transition-colors border-border/30"
                      >
                        <TableCell className="font-semibold text-foreground">
                          {entry.name}
                        </TableCell>
                        <TableCell className="text-muted-foreground hidden sm:table-cell font-medium">
                          {entry.email}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className="bg-blue-50 text-blue-700 border-blue-200 font-medium dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800"
                          >
                            {entry.city}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {getBikeOwnershipBadge(entry.bike_ownership)}
                        </TableCell>
                        <TableCell className="text-muted-foreground font-medium">
                          {new Date(entry.created_at).toLocaleDateString(
                            "en-US",
                            {
                              month: "short",
                              day: "numeric",
                              year: "2-digit",
                            }
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {entries.length === 0 && (
                <div className="text-center py-12 bg-muted/20 rounded-xl border-2 border-dashed border-border/50 mt-4">
                  <Users className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" />
                  <p className="font-semibold text-foreground text-lg mb-2">
                    No waitlist entries yet
                  </p>
                  <p className="text-muted-foreground">
                    Start promoting your pre-launch to get signups!
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
