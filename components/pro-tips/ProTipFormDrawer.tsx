"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/useToast";
import { useCreateProTip, useUpdateProTip } from "@/hooks/useProTipsData";
import { ProTip, createProTipSchema, CreateProTipFormData } from "@/schemas";
import { useWatch } from "react-hook-form";

const CATEGORY_COLORS: Record<string, string> = {
  earning: "bg-green-100 text-green-700",
  timing: "bg-blue-100 text-blue-700",
  compliance: "bg-red-100 text-red-700",
  performance: "bg-violet-100 text-violet-700",
  technical: "bg-slate-100 text-slate-700",
  planning: "bg-amber-100 text-amber-700",
};

interface ProTipFormDrawerProps {
  tip: ProTip | null;
  isOpen: boolean;
  onClose: () => void;
}

const CATEGORIES = [
  { value: "earning", label: "Earning" },
  { value: "timing", label: "Timing" },
  { value: "compliance", label: "Compliance" },
  { value: "performance", label: "Performance" },
  { value: "technical", label: "Technical" },
  { value: "planning", label: "Planning" },
];

export function ProTipFormDrawer({
  tip,
  isOpen,
  onClose,
}: ProTipFormDrawerProps) {
  const { toast } = useToast();
  const createMutation = useCreateProTip();
  const updateMutation = useUpdateProTip();
  const isEditing = !!tip;

  const form = useForm<CreateProTipFormData>({
    resolver: zodResolver(createProTipSchema),
    defaultValues: {
      icon: "",
      text: "",
      category: undefined,
      priority: 0,
      isActive: true,
    },
  });

  useEffect(() => {
    if (tip) {
      form.reset({
        icon: tip.icon,
        text: tip.text,
        category: tip.category,
        priority: tip.priority,
        isActive: tip.isActive,
      });
    } else {
      form.reset({
        icon: "",
        text: "",
        category: undefined,
        priority: 0,
        isActive: true,
      });
    }
  }, [tip, form]);

  const onSubmit = async (values: CreateProTipFormData) => {
    const result = isEditing
      ? await updateMutation.mutateAsync({ id: tip!.id, ...values })
      : await createMutation.mutateAsync(values);

    if (result.success) {
      toast({ title: isEditing ? "Tip updated" : "Tip created" });
      onClose();
    } else {
      toast({
        title: isEditing ? "Failed to update tip" : "Failed to create tip",
        description: result.error,
        variant: "destructive",
      });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  const previewIcon = useWatch({ control: form.control, name: "icon" });
  const previewText = useWatch({ control: form.control, name: "text" });
  const previewCategory = useWatch({ control: form.control, name: "category" });
  const previewActive = useWatch({ control: form.control, name: "isActive" });

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-lg p-0 flex flex-col">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border">
          <SheetTitle>{isEditing ? "Edit Pro Tip" : "New Pro Tip"}</SheetTitle>
          <SheetDescription>
            {isEditing
              ? "Update this tip shown to riders on the home screen."
              : "Create a new tip that will be displayed to riders on the home screen."}
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex-1 flex flex-col overflow-hidden"
          >
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="icon"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Icon (emoji)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="🚲"
                          maxLength={8}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Priority</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          placeholder="0"
                          {...field}
                          onChange={(e) =>
                            field.onChange(Number(e.target.value))
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="text"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tip Text</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Enter the tip text shown to riders..."
                        rows={4}
                        maxLength={300}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                    <p className="text-xs text-muted-foreground text-right">
                      {field.value?.length ?? 0}/300
                    </p>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value ?? ""}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CATEGORIES.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <FormLabel className="cursor-pointer">Active</FormLabel>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Inactive tips won't be shown to riders.
                      </p>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              {/* Mobile preview */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Mobile Preview
                </p>
                {/* Phone frame */}
                <div className="mx-auto w-[240px] rounded-[2rem] border-4 border-foreground/10 bg-background shadow-lg overflow-hidden">
                  {/* Status bar mockup */}
                  <div className="bg-muted/40 px-4 py-1.5 flex justify-between items-center">
                    <span className="text-[9px] font-semibold text-muted-foreground">9:41</span>
                    <div className="flex gap-1">
                      <div className="w-2.5 h-1.5 rounded-sm bg-muted-foreground/50" />
                      <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50" />
                    </div>
                  </div>
                  {/* Tip card — mirrors the mobile ProTipCard layout */}
                  <div className="p-3">
                    <div
                      className={`rounded-2xl p-3 flex items-start gap-3 shadow-sm ${!previewActive ? "opacity-40" : ""}`}
                      style={{ background: "var(--color-surface, hsl(var(--muted)/0.4))" }}
                    >
                      {/* Icon bubble */}
                      <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 text-lg leading-none">
                        {previewIcon || "💡"}
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        {previewCategory && (
                          <span className={`inline-block text-[9px] font-semibold px-1.5 py-0.5 rounded-full capitalize ${CATEGORY_COLORS[previewCategory] ?? "bg-muted text-muted-foreground"}`}>
                            {previewCategory}
                          </span>
                        )}
                        <p className="text-[11px] text-foreground leading-snug line-clamp-4">
                          {previewText || <span className="text-muted-foreground italic">Tip text will appear here…</span>}
                        </p>
                      </div>
                    </div>
                    {!previewActive && (
                      <p className="text-center text-[9px] text-muted-foreground mt-2">
                        Inactive — not shown to riders
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-border flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="flex-1"
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={isPending}>
                {isPending
                  ? "Saving..."
                  : isEditing
                    ? "Save Changes"
                    : "Create Tip"}
              </Button>
            </div>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
