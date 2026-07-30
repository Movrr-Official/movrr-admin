"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  CANONICAL_EMPLOYEE_ROLES,
  type CanonicalEmployeeRole,
} from "@/features/organisations/domain/employeeRoleTemplates";
import { simulateEmployeeRole } from "@/features/authorization/diagnostics";
import { EMPLOYEE_ROLE_OPTIONS } from "@/features/authorization/roleOptions";
import { SOD_RULES } from "@/features/authorization/sod";
import { useCapability } from "@/hooks/useAdminUser";

export function AuthorizationDiagnosticsPage() {
  const canManage = useCapability("authz.manage");
  const [role, setRole] = useState<CanonicalEmployeeRole>("operations_manager");

  const simulation = useMemo(() => simulateEmployeeRole(role), [role]);

  return (
    <div className="min-h-screen page-canvas">
      <div className="space-y-6 md:space-y-8">
        <PageHeader
          title="Authorization"
          description="Inspect employee role templates, capability bundles, navigation, and SoD rules."
        />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Role simulator</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="max-w-md">
              <Select
                value={role}
                onValueChange={(value) =>
                  setRole(value as CanonicalEmployeeRole)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {EMPLOYEE_ROLE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{simulation.department}</Badge>
              <Badge variant="outline">{simulation.dataScope}</Badge>
              <Badge variant="outline">
                {simulation.capabilities.length} capabilities
              </Badge>
              {canManage ? (
                <Badge>authz.manage</Badge>
              ) : (
                <Badge variant="outline">inspect only</Badge>
              )}
            </div>

            <p className="text-sm text-muted-foreground">{simulation.label}</p>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Navigation</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1 text-sm">
                {simulation.navigationHrefs.map((href) => (
                  <li key={href} className="font-mono text-muted-foreground">
                    {href}
                  </li>
                ))}
                {simulation.navigationHrefs.length === 0 && (
                  <li className="text-muted-foreground">No navigation</li>
                )}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Commands & exports</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="mb-1 font-medium">Commands</p>
                <p className="text-muted-foreground">
                  {simulation.commands.join(", ") || "None"}
                </p>
              </div>
              <div>
                <p className="mb-1 font-medium">Export modules</p>
                <p className="text-muted-foreground">
                  {simulation.exportModules.join(", ") || "None"}
                </p>
              </div>
              <div>
                <p className="mb-1 font-medium">SoD approvals</p>
                <p className="text-muted-foreground">
                  {simulation.sodApprovals.join(", ") || "None"}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Capabilities</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {simulation.capabilities.map((cap) => (
                <Badge key={cap} variant="outline" className="font-mono text-xs">
                  {cap}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Permission conflicts</CardTitle>
          </CardHeader>
          <CardContent>
            {simulation.conflicts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No structural SoD conflicts detected for this bundle.
              </p>
            ) : (
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {simulation.conflicts.map((conflict) => (
                  <li key={conflict}>{conflict}</li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">SoD catalogue</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {SOD_RULES.map((rule) => (
                <li key={rule.id} className="rounded-md border border-border/60 p-3">
                  <p className="font-medium">{rule.label}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {rule.approval.initiateCapability} →{" "}
                    {rule.approval.approveCapability}
                    {rule.preventSameActor ? " · same-actor blocked" : ""}
                  </p>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              {CANONICAL_EMPLOYEE_ROLES.length} canonical employee roles defined.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
