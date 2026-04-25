"use client";

import { AlertCircle, Save } from "lucide-react";
import { type UseFormReturn } from "react-hook-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { SettingsFieldConfig } from "@/components/settings/config";

type Props = {
  form: UseFormReturn<any>;
  fields: SettingsFieldConfig[];
  values: Record<string, unknown>;
  isSaving: boolean;
  isSectionReadOnly: boolean;
  hasUnsavedChanges: boolean;
  onSubmit: (values: Record<string, unknown>) => void;
};

export function SettingsSectionForm({
  form,
  fields,
  values,
  isSaving,
  isSectionReadOnly,
  hasUnsavedChanges,
  onSubmit,
}: Props) {
  const errorEntries = Object.entries(form.formState.errors);

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((nextValues) => onSubmit(nextValues))}
        className="space-y-6"
      >
        {errorEntries.length > 0 ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            <div className="mb-2 flex items-center gap-2 font-medium">
              <AlertCircle className="h-4 w-4" />
              Validation summary
            </div>
            <ul className="space-y-1">
              {errorEntries.map(([key, value]) => (
                <li key={key}>
                  {key}:{" "}
                  {value?.message ? String(value.message) : "Invalid value"}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {fields.map((cfg) => (
            <FormField
              key={cfg.name}
              control={form.control}
              name={cfg.name}
              render={({ field }) => {
                const isReadOnly = isSectionReadOnly || cfg.readOnly;
                const isDirty = Boolean(
                  (form.formState.dirtyFields as Record<string, unknown>)?.[
                    cfg.name
                  ],
                );
                const label = (
                  <div className="flex items-center gap-2">
                    <span>{cfg.label}</span>
                    {isDirty ? (
                      <Badge
                        variant="outline"
                        className="text-[10px] uppercase tracking-wide"
                      >
                        Changed
                      </Badge>
                    ) : null}
                    {cfg.readOnly ? (
                      <Badge
                        variant="secondary"
                        className="text-[10px] uppercase tracking-wide"
                      >
                        Env
                      </Badge>
                    ) : null}
                  </div>
                );

                const className =
                  cfg.type === "switch"
                    ? "md:col-span-2 xl:col-span-2"
                    : cfg.type === "textarea"
                      ? "md:col-span-2 xl:col-span-3"
                      : "";

                if (cfg.type === "switch") {
                  return (
                    <FormItem className={className}>
                      <div className="flex items-center justify-between rounded-xl border border-border/60 bg-background/40 px-4 py-3">
                        <div className="space-y-1">
                          <FormLabel>{label}</FormLabel>
                          {cfg.description ? (
                            <p className="text-xs text-muted-foreground">
                              {cfg.description}
                            </p>
                          ) : null}
                        </div>
                        <FormControl>
                          <Switch
                            checked={Boolean(field.value)}
                            onCheckedChange={field.onChange}
                            disabled={Boolean(isReadOnly || isSaving)}
                          />
                        </FormControl>
                      </div>
                    </FormItem>
                  );
                }

                if (cfg.type === "select") {
                  return (
                    <FormItem className={className}>
                      <FormLabel>{label}</FormLabel>
                      <Select
                        value={String(field.value ?? "")}
                        onValueChange={field.onChange}
                        disabled={Boolean(isReadOnly || isSaving)}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {cfg.options?.map((option) => (
                            <SelectItem key={option} value={option}>
                              {option.replaceAll("_", " ")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {cfg.description ? (
                        <p className="text-xs text-muted-foreground">
                          {cfg.description}
                        </p>
                      ) : null}
                      <FormMessage />
                    </FormItem>
                  );
                }

                if (cfg.type === "textarea") {
                  const value =
                    cfg.name === "inviteDomainAllowlist" &&
                    Array.isArray(field.value)
                      ? field.value.join("\n")
                      : (field.value ?? "");

                  return (
                    <FormItem className={className}>
                      <FormLabel>{label}</FormLabel>
                      <FormControl>
                        <Textarea
                          value={value}
                          onChange={(event) => {
                            if (cfg.name === "inviteDomainAllowlist") {
                              field.onChange(
                                event.target.value
                                  .split("\n")
                                  .map((item) => item.trim())
                                  .filter(Boolean),
                              );
                              return;
                            }

                            field.onChange(event.target.value);
                          }}
                          disabled={Boolean(isReadOnly || isSaving)}
                        />
                      </FormControl>
                      {cfg.description ? (
                        <p className="text-xs text-muted-foreground">
                          {cfg.description}
                        </p>
                      ) : null}
                      <FormMessage />
                    </FormItem>
                  );
                }

                return (
                  <FormItem className={className}>
                    <FormLabel>{label}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value ?? ""}
                        type={cfg.type}
                        min={cfg.min}
                        disabled={Boolean(isReadOnly || isSaving)}
                      />
                    </FormControl>
                    {cfg.description ? (
                      <p className="text-xs text-muted-foreground">
                        {cfg.description}
                      </p>
                    ) : null}
                    <FormMessage />
                  </FormItem>
                );
              }}
            />
          ))}
        </div>

        <div className="sticky bottom-4 z-10 rounded-2xl border border-border/70 bg-background/95 p-4 shadow-lg backdrop-blur">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-muted-foreground">
              {hasUnsavedChanges
                ? "You have unsaved changes in this section."
                : "No unsaved changes."}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={!hasUnsavedChanges || isSaving}
                onClick={() => form.reset(values)}
              >
                Discard
              </Button>
              <Button
                type="submit"
                disabled={!hasUnsavedChanges || isSaving || isSectionReadOnly}
              >
                <Save className="mr-2 h-4 w-4" />
                {isSaving ? "Saving..." : "Save Section"}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </Form>
  );
}
