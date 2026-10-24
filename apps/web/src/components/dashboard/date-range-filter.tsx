"use client";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { DATE_PRESETS, DATE_PRESET_LABELS, type DatePreset } from "@/lib/dashboard/constants";

type DateRangeFilterProps = {
  preset: DatePreset;
  onPresetChange: (preset: DatePreset) => void;
  customFrom: string;
  customTo: string;
  onCustomFromChange: (value: string) => void;
  onCustomToChange: (value: string) => void;
};

/** Preset buttons, plus two date inputs when "Custom Range" is selected. */
export function DateRangeFilter({
  preset,
  onPresetChange,
  customFrom,
  customTo,
  onCustomFromChange,
  onCustomToChange,
}: DateRangeFilterProps) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex flex-wrap gap-2">
        {DATE_PRESETS.map((value) => (
          <Button
            key={value}
            type="button"
            variant={preset === value ? "default" : "outline"}
            size="sm"
            onClick={() => onPresetChange(value)}
          >
            {DATE_PRESET_LABELS[value]}
          </Button>
        ))}
      </div>

      {preset === "custom" && (
        <div className="flex items-end gap-2">
          <Field>
            <FieldLabel htmlFor="dashboard-from" className="text-xs">
              From
            </FieldLabel>
            <Input
              id="dashboard-from"
              type="date"
              value={customFrom}
              max={customTo || undefined}
              onChange={(event) => onCustomFromChange(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="dashboard-to" className="text-xs">
              To
            </FieldLabel>
            <Input
              id="dashboard-to"
              type="date"
              value={customTo}
              min={customFrom || undefined}
              onChange={(event) => onCustomToChange(event.target.value)}
            />
          </Field>
        </div>
      )}
    </div>
  );
}
