import { Badge } from "@/components/ui/badge";
import type { User } from "@/schemas";
import { accountRoleLabel } from "@/features/identity/domain/accountDomains";

export function UserRelationships({ user, organisations = true }: { user: User; organisations?: boolean }) {
  const rider = user.riderStatus !== undefined;
  const memberships = (user.memberships ?? []).filter(member => member.status !== "revoked");
  return <div className="flex flex-wrap items-center gap-2">
    {rider && <Badge variant="secondary">Rider{user.riderStatus !== "active" ? ` ? ${user.riderStatus}` : ""}</Badge>}
    {user.employeeRole && <Badge variant="secondary">MOVRR Staff · {accountRoleLabel("staff", user.employeeRole)}</Badge>}
    {organisations && memberships.map(member => <span key={member.id} className="text-xs">
      {member.organisationName} · {accountRoleLabel(member.domain, member.role)}{member.status === "invited" ? " · Invited" : ""}
    </span>)}
    {!rider && !user.employeeRole && memberships.length === 0 && <span className="text-sm text-muted-foreground">User</span>}
  </div>;
}
