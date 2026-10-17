"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  REVIEW_COMMENT_MAX,
  type Review,
  type UpsertReviewInput,
  upsertReviewInputSchema,
} from "@repo/shared";
import { Star } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { useDeleteReview, useSaveReview } from "../hooks/use-reviews";

const LABELS = ["", "Ruim", "Regular", "Bom", "Muito bom", "Excelente"];

export function ReviewForm({
  userId,
  name,
  current,
}: {
  userId: string;
  name: string;
  current: Review | null;
}): React.JSX.Element {
  const save = useSaveReview(userId);
  const remove = useDeleteReview(userId);
  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UpsertReviewInput, unknown, z.output<typeof upsertReviewInputSchema>>({
    resolver: zodResolver(upsertReviewInputSchema),
    defaultValues: { rating: current?.rating ?? 0, comment: current?.comment ?? "" },
  });

  return (
    <form
      onSubmit={handleSubmit((values) => save.mutate(values))}
      noValidate
      className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-4"
    >
      <Controller
        control={control}
        name="rating"
        render={({ field }) => (
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-sm font-semibold">
              {current ? "Sua avaliação" : `Como foi com ${name.split(" ")[0]}?`}
            </legend>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((value) => (
                <label
                  key={value}
                  className="cursor-pointer rounded-md p-0.5 has-focus-visible:outline-2 has-focus-visible:outline-brand"
                >
                  <input
                    type="radio"
                    name={field.name}
                    value={value}
                    checked={field.value === value}
                    onChange={() => field.onChange(value)}
                    className="sr-only"
                  />
                  <Star
                    aria-hidden
                    className={cn(
                      "size-7",
                      value <= field.value ? "fill-warn text-warn" : "fill-none text-edge",
                    )}
                  />
                  <span className="sr-only">
                    {value} estrela{value === 1 ? "" : "s"} — {LABELS[value]}
                  </span>
                </label>
              ))}
              {field.value > 0 && (
                <span className="ml-2 text-sm font-semibold text-ink-soft">
                  {LABELS[field.value]}
                </span>
              )}
            </div>
            {errors.rating && (
              <p role="alert" className="text-[0.82rem] font-medium text-danger">
                Escolha de 1 a 5 estrelas
              </p>
            )}
          </fieldset>
        )}
      />
      <Field
        label="Comentário (opcional)"
        hint="Conte como foi o serviço ou a compra. Aparece para os vizinhos."
        error={errors.comment?.message}
      >
        {({ id, describedBy, invalid }) => (
          <Textarea
            id={id}
            maxLength={REVIEW_COMMENT_MAX}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            {...register("comment")}
          />
        )}
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" loading={save.isPending}>
          {current ? "Atualizar avaliação" : "Enviar avaliação"}
        </Button>
        {current && (
          <Button
            variant="ghost"
            size="sm"
            loading={remove.isPending}
            onClick={() => remove.mutate()}
          >
            Apagar
          </Button>
        )}
      </div>
    </form>
  );
}
