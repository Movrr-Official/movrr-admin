import Link from "next/link";
import { InventoryCommandForm } from "@/components/riders/InventoryCommandForm";
import {
  getAccessoryAssignments,
  getAvailableEquipment,
} from "@/app/actions/accessories";
import { requireCapability } from "@/lib/admin";
import { AccessoryCommandForm } from "@/components/riders/AccessoryCommandForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
export default async function AccessoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ riderId?: string; cursor?: string; inventoryCursor?: string }>;
}) {
  const actor = await requireCapability("riders.read");
  const params = await searchParams;
  const page = await getAccessoryAssignments(params.riderId, params.cursor);
  const inventory = await getAvailableEquipment(params.inventoryCursor);
  const canManage =
    actor.adminUser &&
    (await import("@/lib/authPermissions")).hasAdminPermission(
      actor.adminUser.role,
      "riders.manage",
    );
  return (
    <div className="page-canvas space-y-6">
      <h1 className="text-2xl font-semibold">Campaign equipment operations</h1>
      {!page.assignments.length && <p>No equipment assignments found.</p>}
      {page.assignments.map((a) => (
        <Card key={a.id}>
          <CardHeader>
            <CardTitle>
              {a.asset_code} / {a.status}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>Rider {a.rider_id}</p>
            <p>Campaign {a.campaign_id}</p>
            {a.events.map((e) => (
              <p key={e.id} className="text-sm">
                {e.event_type} / {e.note} / {e.created_at}
              </p>
            ))}
            {canManage && !["returned", "cancelled"].includes(a.status) && (
              <AccessoryCommandForm
                key={a.updated_at}
                id={a.id}
                expected={a.updated_at}
              />
            )}
          </CardContent>
        </Card>
      ))}
      <h2 className="text-xl font-semibold">Available equipment and inspection</h2>
      {inventory.items.map((i) => (
        <Card key={i.id}>
          <CardHeader>
            <CardTitle>
              {i.asset_code} / {i.status}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {canManage && (
              <InventoryCommandForm
                key={i.updated_at}
                id={i.id}
                expected={i.updated_at}
                status={i.status}
              />
            )}
          </CardContent>
        </Card>
      ))}
      {inventory.nextCursor && (
        <Link
          href={`/riders/accessories?${new URLSearchParams({ ...params, inventoryCursor: inventory.nextCursor })}`}
        >
          Next inventory page
        </Link>
      )}
      {page.nextCursor && (
        <Link
          href={`/riders/accessories?${new URLSearchParams({ ...params, cursor: page.nextCursor })}`}
        >
          Next equipment page
        </Link>
      )}
    </div>
  );
}
