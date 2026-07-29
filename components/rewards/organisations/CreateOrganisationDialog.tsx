"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/useToast";
import { useCreateOrganisation } from "@/hooks/useOrganisationsData";
import { trackOpsEvent } from "@/lib/opsTelemetry";
import type { Organisation } from "@/features/organisations/domain/Organisation";
import { formatOrganisationType } from "@/features/organisations/presentation";

const schema = z.object({
  name: z
    .string()
    .min(1, "Organisation name is required")
    .max(120, "Name must be less than 120 characters"),
  type: z.enum(["reward_partner", "advertiser", "government", "movrr"]),
});

type FormData = z.infer<typeof schema>;

const TYPES: Organisation["type"][] = [
  "reward_partner",
  "advertiser",
  "government",
  "movrr",
];

type CreateOrganisationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (organisation: Organisation) => void;
};

export function CreateOrganisationDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateOrganisationDialogProps) {
  const { toast } = useToast();
  const createOrganisation = useCreateOrganisation();
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      type: "reward_partner",
    },
  });

  const onSubmit = async (data: FormData) => {
    setSubmitting(true);
    try {
      const organisation = await createOrganisation.mutateAsync({
        name: data.name.trim(),
        type: data.type,
      });
      trackOpsEvent("organisation_type_selected", {
        surface: "organisations",
        type: data.type,
        source: "create_dialog",
      });
      toast({
        title: "Organisation created",
        description: `${organisation.name} (${formatOrganisationType(organisation.type)}) is now in the directory.`,
      });
      form.reset({ name: "", type: "reward_partner" });
      onOpenChange(false);
      onCreated?.(organisation);
    } catch (error) {
      toast({
        title: "Creation failed",
        description:
          error instanceof Error
            ? error.message
            : "Failed to create organisation.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Organisation</DialogTitle>
          <DialogDescription>
            Provision a platform institution. Choose the correct type — Reward
            Partners can continue readiness work in Partner Operations.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit(onSubmit)}
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Organisation name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Institution name"
                      disabled={submitting}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={submitting}
                  >
                    <FormControl>
                      <SelectTrigger aria-label="Organisation type">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {formatOrganisationType(type)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={submitting}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating…
                  </>
                ) : (
                  "Create Organisation"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
