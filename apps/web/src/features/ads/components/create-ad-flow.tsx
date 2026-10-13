"use client";

import {
  type AdDraft,
  type AdFormOptions,
  AI_TONE_LABELS,
  type AiTone,
  aiToneSchema,
  type UploadedImage,
} from "@repo/shared";
import { useQueryClient } from "@tanstack/react-query";
import { PenLine, RotateCcw, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { useState } from "react";
import { toast } from "sonner";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { createAd, generateAdDraft } from "../api/ads-api";
import { adKeys } from "../hooks/use-ads";
import { AdForm, type AdFormValues, formatPriceInput, toAdInput } from "./ad-form";
import { ImagePicker } from "./image-picker";

const MODES = ["ia", "manual"] as const;

export function emptyAdValues(options: AdFormOptions, images: UploadedImage[] = []): AdFormValues {
  return {
    buildingId: options.buildings[0]?.id ?? "",
    type: "servico",
    categoryId: "",
    title: "",
    description: "",
    priceMode: "a_combinar",
    price: "",
    radiusKm: 0,
    whatsappEnabled: false,
    phone: "",
    availability: "",
    tagsText: "",
    images,
  };
}

function valuesFromDraft(
  options: AdFormOptions,
  draft: AdDraft,
  images: UploadedImage[],
): AdFormValues {
  const cover = images.find((image) => image.id === draft.coverImageId);
  const ordered = cover ? [cover, ...images.filter((image) => image.id !== cover.id)] : images;
  return {
    ...emptyAdValues(options, ordered),
    type: draft.type ?? "servico",
    categoryId: draft.categoryId ?? "",
    title: draft.title,
    description: draft.description,
    priceMode: draft.priceMode ?? "a_combinar",
    price: formatPriceInput(draft.priceCents),
    availability: draft.availability ?? "",
    tagsText: draft.tags.join(", "),
  };
}

function ModeChooser({
  aiEnabled,
  onChoose,
}: {
  aiEnabled: boolean;
  onChoose: (mode: (typeof MODES)[number]) => void;
}): React.JSX.Element {
  return (
    <>
      <button
        type="button"
        onClick={() => onChoose("ia")}
        disabled={!aiEnabled}
        className="group flex items-start gap-4 rounded-2xl border-2 border-brand/30 bg-white p-5 text-left transition-colors hover:border-brand disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-brand text-white">
          <Sparkles className="size-6" aria-hidden />
        </span>
        <span>
          <span className="block text-lg font-extrabold">Escrever do meu jeito</span>
          <span className="mt-1 block text-ink-soft">
            {aiEnabled
              ? "Conte em poucas palavras e mande fotos. A IA monta o anúncio e você revisa antes de publicar."
              : "A criação com IA está indisponível no momento."}
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={() => onChoose("manual")}
        className="flex items-start gap-4 rounded-2xl border border-line bg-white p-5 text-left transition-colors hover:border-ink-soft/40"
      >
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-sand text-ink">
          <PenLine className="size-6" aria-hidden />
        </span>
        <span>
          <span className="block text-lg font-extrabold">Preencher os campos</span>
          <span className="mt-1 block text-ink-soft">
            Você escreve título, descrição e preço do seu jeito.
          </span>
        </span>
      </button>
    </>
  );
}

export function CreateAdFlow({ options }: { options: AdFormOptions }): React.JSX.Element {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [mode, setMode] = useQueryState("modo", parseAsStringLiteral(MODES));
  const [text, setText] = useState("");
  const [tone, setTone] = useState<AiTone>("amigavel");
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [draft, setDraft] = useState<AdDraft | null>(null);
  const [generating, setGenerating] = useState(false);
  const [remaining, setRemaining] = useState(options.aiRemainingToday);

  async function publish(values: AdFormValues): Promise<void> {
    const ad = await createAd({ ...toAdInput(values), aiDraftId: draft?.draftId ?? null });
    await queryClient.invalidateQueries({ queryKey: adKeys.all });
    toast.success(
      ad.status === "ativo"
        ? "Anúncio publicado!"
        : "Anúncio enviado! Estamos conferindo e já já ele aparece.",
    );
    router.push(`/meus-anuncios?novo=${ad.id}`);
  }

  async function generate(): Promise<void> {
    setGenerating(true);
    try {
      const result = await generateAdDraft({
        text,
        imageIds: images.map((image) => image.id),
        tone,
      });
      setRemaining(result.remainingToday);
      setDraft(result);
    } catch (cause) {
      toast.error(
        cause instanceof ApiError ? cause.message : "Não foi possível gerar o anúncio agora.",
      );
    } finally {
      setGenerating(false);
    }
  }

  if (!options.canPublish) {
    return <Alert tone="info">{options.cannotPublishReason}</Alert>;
  }

  const limitReached = options.activeAds >= options.maxActiveAds;
  const limitAlert = limitReached && (
    <Alert tone="info">
      Você já tem {options.maxActiveAds} anúncios ativos, o máximo permitido. Pause ou exclua um em
      “Meus anúncios” para publicar outro.
    </Alert>
  );

  if (!mode) {
    return (
      <div className="flex flex-col gap-4">
        {limitAlert}
        <ModeChooser aiEnabled={options.aiEnabled} onChoose={(next) => void setMode(next)} />
      </div>
    );
  }

  if (mode === "manual") {
    return (
      <div className="flex flex-col gap-6">
        {limitAlert}
        <AdForm
          options={options}
          defaultValues={emptyAdValues(options)}
          submitLabel="Publicar anúncio"
          onSubmit={publish}
        />
      </div>
    );
  }

  if (draft) {
    const blocked = draft.warnings.length > 0 && !draft.title;
    return (
      <div className="flex flex-col gap-6">
        {limitAlert}
        {draft.warnings.length > 0 && (
          <Alert tone={blocked ? "error" : "info"}>
            {draft.warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </Alert>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-bold">Revise o anúncio</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDraft(null)}
            disabled={remaining <= 0}
          >
            <RotateCcw className="size-4" aria-hidden />
            Ajustar e gerar de novo
          </Button>
        </div>
        {!blocked && (
          <AdForm
            key={draft.draftId}
            options={{ ...options, aiRemainingToday: remaining }}
            defaultValues={valuesFromDraft(options, draft, images)}
            toConfirm={draft.toConfirm}
            submitLabel="Publicar anúncio"
            onSubmit={publish}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {limitAlert}
      <div className="flex flex-col gap-2">
        <label htmlFor="ai-text" className="text-sm font-semibold">
          O que você quer anunciar?
        </label>
        <Textarea
          id="ai-text"
          rows={5}
          maxLength={2000}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Ex.: faço bolo de pote, 10 reais, chocolate e ninho. Entrego no prédio."
        />
        <p className="text-[0.82rem] text-muted">
          Escreva como falaria com um vizinho. Preço e horários só se quiser.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold">Fotos (opcional)</span>
        <ImagePicker images={images} onChange={setImages} disabled={generating} />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">Tom do texto</legend>
        <div className="flex flex-wrap gap-2">
          {aiToneSchema.options.map((option) => (
            <label
              key={option}
              className={cn(
                "cursor-pointer rounded-full border px-4 py-2 text-[0.92rem] font-semibold has-focus-visible:outline-2 has-focus-visible:outline-brand",
                tone === option ? "border-ink bg-ink text-white" : "border-line bg-white",
              )}
            >
              <input
                type="radio"
                name="tone"
                value={option}
                checked={tone === option}
                onChange={() => setTone(option)}
                className="sr-only"
              />
              {AI_TONE_LABELS[option]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <Button
          onClick={generate}
          loading={generating}
          disabled={(text.trim().length < 3 && images.length === 0) || remaining <= 0}
        >
          {!generating && <Sparkles className="size-4.5" aria-hidden />}
          {generating ? "Escrevendo seu anúncio…" : "Gerar anúncio"}
        </Button>
        <p className="text-sm text-muted" aria-live="polite">
          {remaining > 0
            ? `Você pode usar a IA mais ${remaining} vez(es) hoje.`
            : "Limite de hoje atingido. Crie manualmente."}
        </p>
      </div>
    </div>
  );
}
