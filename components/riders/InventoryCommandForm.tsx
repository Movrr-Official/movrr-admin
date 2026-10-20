"use client";
import { useActionState, useState } from "react";
import { inventoryCommand } from "@/app/actions/accessories";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
export function InventoryCommandForm({
  id,
  expected,
  status,
}: {
  id: string;
  expected: string;
  status: string;
}) {
  const [operation] = useState(() => crypto.randomUUID());
  const [result, action, pending] = useActionState(inventoryCommand, null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="inventory" value={id} />
      <input type="hidden" name="expected" value={expected} />
      <input type="hidden" name="operation" value={operation} />
      <label>
        Action
        <select className="ml-3 rounded border p-2" name="action">
          {status === "available" && (
            <option value="assign">Assign to confirmed campaign rider</option>
          )}
          {status === "maintenance" && (
            <option value="available">Inspection passed: make available</option>
          )}
          <option value="retired">Retire equipment</option>
        </select>
      </label>
      {status === "available" && (
        <>
          <label className="block">
            Rider ID
            <Input name="rider" />
          </label>
          <label className="block">
            Campaign ID
            <Input name="campaign" />
          </label>
        </>
      )}
      <label className="block">
        Reason / inspection evidence
        <Input name="reason" required minLength={10} maxLength={2000} />
      </label>
      <Button disabled={pending || result?.success}>Confirm inventory action</Button>
      <p role="status">
        {result?.success ? "Inventory action recorded." : result?.error}
      </p>
    </form>
  );
}
