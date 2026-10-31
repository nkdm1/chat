"use client";

import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { Controller } from "react-hook-form";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type Props<T extends FieldValues> = Omit<
  React.ComponentProps<typeof Input>,
  "name" | "defaultValue"
> & {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
};

export function TextField<T extends FieldValues>({
  control,
  name,
  label,
  ...inputProps
}: Props<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={name}>{label}</FieldLabel>
          <Input
            {...inputProps}
            {...field}
            id={name}
            aria-invalid={fieldState.invalid}
          />
          {fieldState.invalid && (
            <FieldError className="animate-enter" errors={[fieldState.error]} />
          )}
        </Field>
      )}
    />
  );
}
