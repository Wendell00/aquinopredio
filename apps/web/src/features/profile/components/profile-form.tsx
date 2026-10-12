"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { displayNameSchema, type Me, phoneSchema } from "@repo/shared";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { updateProfile } from "@/features/me/api/me-api";
import { ApiError } from "@/lib/api/client";

const schema = z.object({
  name: displayNameSchema,
  phone: z
    .string()
    .refine(
      (value) => !value || phoneSchema.safeParse(value).success,
      "Informe um celular com DDD",
    ),
});
type Values = z.infer<typeof schema>;

export function ProfileForm({ me }: { me: Me }): React.JSX.Element {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
    reset,
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: me.name, phone: me.phone ?? "" },
  });

  async function onSubmit(values: Values): Promise<void> {
    try {
      const updated = await updateProfile({ name: values.name, phone: values.phone || null });
      reset({ name: updated.name, phone: updated.phone ?? "" });
      toast.success("Perfil atualizado");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Não foi possível salvar.");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      <Field label="Nome de exibição" error={errors.name?.message}>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            autoComplete="name"
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            {...register("name")}
          />
        )}
      </Field>
      <Field
        label="Celular (opcional)"
        hint="Usado só no botão de WhatsApp dos seus anúncios. Nunca aparece no app."
        error={errors.phone?.message}
      >
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="(11) 91234-5678"
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            {...register("phone")}
          />
        )}
      </Field>
      <p className="text-sm text-muted">E-mail: {me.email}</p>
      <Button
        type="submit"
        size="sm"
        className="self-start"
        loading={isSubmitting}
        disabled={!isDirty}
      >
        Salvar
      </Button>
    </form>
  );
}
