"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/useToast";
import type { OrganisationMembership } from "@/features/organisations/domain/Membership";
import type { MembershipRole } from "@/features/organisations/domain/CapabilityCatalog";
import {
  useAddOrganisationStaff,
  useUpdateOrganisationStaffRole,
} from "@/hooks/useOrganisationsData";

const ROLES: MembershipRole[] = ["owner", "manager", "staff", "viewer"];

type PartnerStaffPanelProps = {
  organisationId: string;
  staff: OrganisationMembership[];
  isLoading: boolean;
};

export function PartnerStaffPanel({
  organisationId,
  staff,
  isLoading,
}: PartnerStaffPanelProps) {
  const { toast } = useToast();
  const addStaff = useAddOrganisationStaff();
  const updateRole = useUpdateOrganisationStaffRole();
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<MembershipRole>("staff");

  const handleAdd = async () => {
    if (!userId.trim()) {
      toast({
        title: "User ID required",
        description: "Provide the auth user id to invite.",
        variant: "destructive",
      });
      return;
    }
    try {
      await addStaff.mutateAsync({
        organisationId,
        userId: userId.trim(),
        role,
      });
      setUserId("");
      toast({
        title: "Staff added",
        description: "Membership created via Platform API.",
      });
    } catch (error) {
      toast({
        title: "Add staff failed",
        description:
          error instanceof Error ? error.message : "Platform API request failed",
        variant: "destructive",
      });
    }
  };

  const handleRoleChange = async (
    membershipId: string,
    nextRole: MembershipRole,
  ) => {
    try {
      await updateRole.mutateAsync({
        organisationId,
        membershipId,
        role: nextRole,
      });
      toast({
        title: "Role updated",
        description: "Membership role changed via Platform API.",
      });
    } catch (error) {
      toast({
        title: "Role update failed",
        description:
          error instanceof Error ? error.message : "Platform API request failed",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-[1fr_160px_auto]">
        <div className="space-y-2">
          <Label htmlFor="staff-user-id">User ID</Label>
          <Input
            id="staff-user-id"
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
            placeholder="auth user uuid"
            className="font-mono text-sm"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="staff-role">Role</Label>
          <Select
            value={role}
            onValueChange={(value) => setRole(value as MembershipRole)}
          >
            <SelectTrigger id="staff-role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end">
          <Button
            type="button"
            onClick={() => void handleAdd()}
            disabled={addStaff.isPending}
          >
            Add staff
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Loading staff…
        </div>
      ) : staff.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No staff memberships yet.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Bundle</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {staff.map((member) => (
              <TableRow key={member.id}>
                <TableCell className="font-mono text-xs">
                  {member.userId}
                </TableCell>
                <TableCell>
                  <Select
                    value={member.role}
                    onValueChange={(value) =>
                      void handleRoleChange(
                        member.id,
                        value as MembershipRole,
                      )
                    }
                    disabled={updateRole.isPending}
                  >
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((item) => (
                        <SelectItem key={item} value={item}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-sm">{member.status}</TableCell>
                <TableCell className="font-mono text-xs">
                  {member.bundleKey}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
