"use client";
import { useActionState, useId, useState } from "react";
import { accessoryCommand } from "@/app/actions/accessories";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
export function AccessoryCommandForm({ id, expected }: { id: string; expected: string }) {
  const [operation] = useState(() => crypto.randomUUID());
  const fieldId = useId();
  const [result, action, pending] = useActionState(accessoryCommand, null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="assignment" value={id} />
      <input type="hidden" name="expected" value={expected} />
      <input type="hidden" name="operation" value={operation} />
      <div className="space-y-2">
        <Label htmlFor={`${fieldId}-action`}>Action</Label>
        <Select name="action" defaultValue="return_due">
          <SelectTrigger id={`${fieldId}-action`} className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="return_due">Request return</SelectItem>
            <SelectItem value="return">Record physical return</SelectItem>
            <SelectItem value="replace">Replace equipment</SelectItem>
            <SelectItem value="cancel">Cancel uninstalled assignment</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${fieldId}-reason`}>Reason</Label>
        <Input id={`${fieldId}-reason`} name="reason" required minLength={10} maxLength={2000} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${fieldId}-replacement`}>Replacement inventory ID (replacement only)</Label>
        <Input id={`${fieldId}-replacement`} name="replacement" defaultValue="" />
      </div>
      <Button disabled={pending || result?.success} type="submit">
        {pending ? "Applying..." : "Confirm equipment action"}
      </Button>
      <p role="status">
        {result?.success
          ? "Action recorded. Refresh to review the latest state."
          : result?.error}
      </p>
    </form>
  );
}
