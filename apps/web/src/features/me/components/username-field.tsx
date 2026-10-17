"use client";

import { USERNAME_MAX_LENGTH } from "@repo/shared";
import { Check, Loader2 } from "lucide-react";
import type { UseFormRegisterReturn } from "react-hook-form";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useUsernameAvailability } from "../hooks/use-username-availability";

/** Campo "@nome de usuário" com aviso de disponibilidade em tempo real. */
export function UsernameField({
  registration,
  value,
  current,
  error,
}: {
  registration: UseFormRegisterReturn;
  value: string;
  /** Nome atual da pessoa (não é consultado de novo). */
  current: string | null;
  error?: string;
}): React.JSX.Element {
  const availability = useUsernameAvailability(value, current);
  const taken = availability.data && !availability.data.available ? availability.data.reason : null;
  const free = availability.data?.available && availability.username !== current;

  return (
    <Field
      label="Nome de usuário"
      hint={
        <span aria-live="polite" className="inline-flex items-center gap-1">
          {availability.isFetching ? (
            <>
              <Loader2 className="size-3.5 animate-spin" aria-hidden /> Conferindo…
            </>
          ) : free ? (
            <span className="inline-flex items-center gap-1 font-semibold text-leaf">
              <Check className="size-3.5" aria-hidden /> @{availability.username} está livre
            </span>
          ) : (
            "Único no app. Letras sem acento, números, _ e ."
          )}
        </span>
      }
      error={error ?? taken ?? undefined}
    >
      {({ id, describedBy, invalid }) => (
        <div className="relative">
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-4 grid place-items-center font-semibold text-muted"
          >
            @
          </span>
          <Input
            id={id}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={USERNAME_MAX_LENGTH + 1}
            className="pl-9"
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            {...registration}
          />
        </div>
      )}
    </Field>
  );
}
