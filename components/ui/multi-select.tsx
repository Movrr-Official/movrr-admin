"use client";

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandInput,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

type Option = {
  label: string;
  value: string;
};

interface MultiSelectProps {
  options: Option[];
  selected: string[];
  onChange: (selected: string[]) => void;
  label?: string;
  placeholder?: string;
  className?: string;
  isMulti?: boolean;
}

export function MultiSelect({
  options,
  selected,
  onChange,
  label,
  placeholder = "Select options...",
  className,
  isMulti = true,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);

  const toggleOption = (value: string) => {
    if (isMulti) {
      if (selected.includes(value)) {
        onChange(selected.filter((v) => v !== value));
      } else {
        onChange([...selected, value]);
      }
    } else {
      onChange([value]); // single select behavior
      setOpen(false); // close dropdown on single select
    }
  };

  const selectedLabels = options
    .filter((o) => selected.includes(o.value))
    .map((o) => o.label);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("min-w-[125px] justify-between", className)}
        >
          {label || selectedLabels.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {label && (
                <span
                  className={`${selectedLabels.length > 0 ? "font-medium text-foreground" : "font-normal text-muted-foreground"}  `}
                >
                  {label}
                </span>
              )}
              <span
                className={`inline-flex items-center justify-center h-5 w-5 rounded-full text-xs font-medium
      ${selectedLabels.length > 0 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
              >
                {selectedLabels.length}
              </span>
            </div>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}

          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[200px] p-0 ml-12">
        <Command>
          <CommandInput placeholder="Search..." />
          <ScrollArea className="max-h-[350px]">
            <CommandList>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    onSelect={() => toggleOption(option.value)}
                    className="cursor-pointer px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                  >
                    <div
                      className={cn(
                        "mr-2 flex h-4 w-4 items-center justify-center rounded border",
                        selected.includes(option.value)
                          ? "bg-primary text-primary-foreground"
                          : "border-muted"
                      )}
                    >
                      {selected.includes(option.value) && (
                        <Check className="h-4 w-4" />
                      )}
                    </div>
                    {option.label}
                  </CommandItem>
                ))}
              </CommandGroup>
              <div
                className="px-3 py-2 border-t border-border text-sm text-muted-foreground cursor-pointer hover:text-foreground"
                onClick={() => onChange([])}
              >
                Clear
              </div>
            </CommandList>
          </ScrollArea>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
