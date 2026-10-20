"use client";
import { useActionState, useId, useState } from "react";
import { inventoryCommand } from "@/app/actions/accessories";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  const fieldId = useId();
  const [result, action, pending] = useActionState(inventoryCommand, null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="inventory" value={id} />
      <input type="hidden" name="expected" value={expected} />
      <input type="hidden" name="operation" value={operation} />
      <div className="space-y-2">
        <Label htmlFor={`${fieldId}-action`}>Action</Label>
        <Select name="action" defaultValue={status === "available" ? "assign" : status === "maintenance" ? "available" : "retired"}>
          <SelectTrigger id={`${fieldId}-action`} className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {status === "available" && (
              <SelectItem value="assign">Assign to confirmed campaign rider</SelectItem>
            )}
            {status === "maintenance" && (
              <SelectItem value="available">Inspection passed: make available</SelectItem>
            )}
            <SelectItem value="retired">Retire equipment</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {status === "available" && (
        <>
          <div className="space-y-2">
            <Label htmlFor={`${fieldId}-rider`}>Rider ID</Label>
            <Input id={`${fieldId}-rider`} name="rider" />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${fieldId}-campaign`}>Campaign ID</Label>
            <Input id={`${fieldId}-campaign`} name="campaign" />
          </div>
        </>
      )}
      <div className="space-y-2">
        <Label htmlFor={`${fieldId}-reason`}>Reason / inspection evidence</Label>
        <Input id={`${fieldId}-reason`} name="reason" required minLength={10} maxLength={2000} />
      </div>
      <Button disabled={pending || result?.success}>Confirm inventory action</Button>
      <p role="status">
        {result?.success ? "Inventory action recorded." : result?.error}
      </p>
    </form>
  );
}
