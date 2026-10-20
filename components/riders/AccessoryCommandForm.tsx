"use client";
import { useActionState, useState } from "react";
import { accessoryCommand } from "@/app/actions/accessories";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
export function AccessoryCommandForm({ id, expected }: { id: string; expected: string }) {
  const [operation] = useState(() => crypto.randomUUID());
  const [result, action, pending] = useActionState(accessoryCommand, null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="assignment" value={id} />
      <input type="hidden" name="expected" value={expected} />
      <input type="hidden" name="operation" value={operation} />
      <label className="block">
        Action
        <select name="action" className="ml-3 rounded border p-2">
          <option value="return_due">Request return</option>
          <option value="return">Record physical return</option>
          <option value="replace">Replace equipment</option>
          <option value="cancel">Cancel uninstalled assignment</option>
        </select>
      </label>
      <label className="block">
        Reason
        <Input name="reason" required minLength={10} maxLength={2000} />
      </label>
      <label className="block">
        Replacement inventory ID (replacement only)
        <Input name="replacement" defaultValue="" />
      </label>
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
