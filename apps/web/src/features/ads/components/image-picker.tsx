"use client";

import { MAX_AD_IMAGES, type UploadedImage } from "@repo/shared";
import { ImagePlus, Loader2, Star, X } from "lucide-react";
import Image from "next/image";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { uploadAdImage } from "../api/ads-api";

interface PendingUpload {
  key: string;
  preview: string;
}

/**
 * Fotos do anúncio (até 6). A primeira é a capa. Cada foto é comprimida no aparelho e enviada
 * na hora; o formulário guarda só os ids devolvidos pela API.
 */
export function ImagePicker({
  images,
  onChange,
  disabled = false,
}: {
  images: UploadedImage[];
  onChange: (images: UploadedImage[]) => void;
  disabled?: boolean;
}): React.JSX.Element {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const latest = useRef(images);
  latest.current = images;

  const remaining = MAX_AD_IMAGES - images.length - pending.length;

  async function handleFiles(files: FileList | null): Promise<void> {
    if (!files?.length) return;
    const selected = Array.from(files).slice(0, Math.max(0, remaining));
    if (files.length > selected.length)
      toast.info(`Cada anúncio pode ter até ${MAX_AD_IMAGES} fotos.`);
    const items = selected.map((file) => ({
      file,
      key: crypto.randomUUID(),
      preview: URL.createObjectURL(file),
    }));
    setPending((current) => [...current, ...items.map(({ key, preview }) => ({ key, preview }))]);

    for (const item of items) {
      try {
        const uploaded = await uploadAdImage(item.file);
        onChange([...latest.current, uploaded]);
      } catch (error) {
        toast.error(
          error instanceof ApiError ? error.message : "Não foi possível enviar uma das fotos.",
        );
      } finally {
        URL.revokeObjectURL(item.preview);
        setPending((current) => current.filter((p) => p.key !== item.key));
      }
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  function makeCover(index: number): void {
    const next = [...images];
    const [cover] = next.splice(index, 1);
    if (cover) onChange([cover, ...next]);
  }

  return (
    <div className="flex flex-col gap-2">
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {images.map((image, index) => (
          <li
            key={image.id}
            className="group relative aspect-square overflow-hidden rounded-xl border border-line bg-sand"
          >
            <Image
              src={image.thumbUrl}
              alt={`Foto ${index + 1}`}
              fill
              sizes="160px"
              className="object-cover"
            />
            {index === 0 ? (
              <span className="absolute left-1.5 top-1.5 rounded-full bg-ink/80 px-2 py-0.5 text-[0.7rem] font-semibold text-white">
                Capa
              </span>
            ) : (
              <button
                type="button"
                onClick={() => makeCover(index)}
                disabled={disabled}
                className="absolute left-1.5 top-1.5 grid size-8 place-items-center rounded-full bg-white/90 text-ink shadow"
                aria-label={`Usar a foto ${index + 1} como capa`}
              >
                <Star className="size-4" aria-hidden />
              </button>
            )}
            <button
              type="button"
              onClick={() => onChange(images.filter((item) => item.id !== image.id))}
              disabled={disabled}
              className="absolute right-1.5 top-1.5 grid size-8 place-items-center rounded-full bg-white/90 text-ink shadow"
              aria-label={`Remover a foto ${index + 1}`}
            >
              <X className="size-4" aria-hidden />
            </button>
          </li>
        ))}
        {pending.map((item) => (
          <li
            key={item.key}
            className="relative aspect-square overflow-hidden rounded-xl border border-line bg-sand"
          >
            {/* biome-ignore lint/performance/noImgElement: prévia local (blob:) antes do upload */}
            <img src={item.preview} alt="" className="size-full object-cover opacity-50" />
            <span className="absolute inset-0 grid place-items-center" role="status">
              <Loader2 className="size-6 animate-spin text-ink" aria-hidden />
              <span className="sr-only">Enviando foto</span>
            </span>
          </li>
        ))}
        {remaining > 0 && (
          <li className="aspect-square">
            <label
              htmlFor={inputId}
              className={cn(
                "flex size-full cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-edge/50 text-center text-[0.8rem] font-semibold text-ink-soft transition-colors hover:border-brand hover:text-brand",
                disabled && "pointer-events-none opacity-50",
              )}
            >
              <ImagePlus className="size-6" aria-hidden />
              Adicionar foto
            </label>
            <input
              ref={inputRef}
              id={inputId}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              multiple
              className="sr-only"
              disabled={disabled}
              onChange={(event) => void handleFiles(event.target.files)}
            />
          </li>
        )}
      </ul>
      <p className="text-[0.82rem] text-muted">
        Até {MAX_AD_IMAGES} fotos. Removemos a localização e outros dados escondidos das imagens.
      </p>
    </div>
  );
}
