"use client";

import { REPORT_REASON_LABELS, type ReportReason, reportReasonSchema } from "@repo/shared";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { ApiError } from "@/lib/api/client";
import { report } from "../api/feed-api";

/** Denúncia (RN-092) num <dialog> nativo: foco preso e Esc para fechar sem biblioteca extra. */
export function ReportDialog({
  targetType,
  targetId,
  trigger,
}: {
  targetType: "ad" | "user" | "message" | "referral";
  targetId: string;
  trigger: (open: () => void) => React.ReactNode;
}): React.JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [sending, setSending] = useState(false);

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!reason) return;
    setSending(true);
    try {
      await report({ targetType, targetId, reason, details: details || undefined });
      toast.success("Denúncia enviada. Obrigado por ajudar a manter a vizinhança segura.");
      dialog.current?.close();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Não foi possível enviar a denúncia.",
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {trigger(() => dialog.current?.showModal())}
      <dialog
        ref={dialog}
        aria-labelledby={`report-${targetId}`}
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl bg-cream p-0 text-ink shadow-lift backdrop:bg-ink/40"
      >
        <form onSubmit={submit} className="flex flex-col gap-4 p-6">
          <h2 id={`report-${targetId}`} className="text-lg font-extrabold">
            {targetType === "ad"
              ? "Denunciar anúncio"
              : targetType === "user"
                ? "Denunciar pessoa"
                : targetType === "referral"
                  ? "Denunciar indicação"
                  : "Denunciar mensagem"}
          </h2>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm text-ink-soft">O que está errado?</legend>
            {reportReasonSchema.options.map((option) => (
              <label
                key={option}
                className="flex cursor-pointer items-center gap-3 rounded-xl border border-line bg-white px-4 py-3 has-checked:border-brand"
              >
                <input
                  type="radio"
                  name="reason"
                  value={option}
                  checked={reason === option}
                  onChange={() => setReason(option)}
                  className="accent-brand"
                />
                {REPORT_REASON_LABELS[option]}
              </label>
            ))}
          </fieldset>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`report-details-${targetId}`} className="text-sm font-semibold">
              Detalhes {reason === "outro" ? "" : "(opcional)"}
            </label>
            <Textarea
              id={`report-details-${targetId}`}
              rows={3}
              maxLength={500}
              value={details}
              onChange={(event) => setDetails(event.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => dialog.current?.close()}>
              Cancelar
            </Button>
            <Button
              type="submit"
              loading={sending}
              disabled={!reason || (reason === "outro" && details.trim().length < 5)}
            >
              Enviar denúncia
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
