"use client";

import type { Message } from "@repo/shared";
import { Minus, Plus, RotateCcw, X } from "lucide-react";
import Image from "next/image";
import { useRef, useState } from "react";
import { cn } from "@/lib/cn";

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const STEP = 0.5;

type View = { scale: number; x: number; y: number };
type Point = { x: number; y: number };
const INITIAL: View = { scale: 1, x: 0, y: 0 };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Foto da mensagem ampliada num <dialog> nativo (foco preso, Esc fecha), com zoom por botões,
 * roda do mouse, duplo clique/toque e pinça, e arraste para mover a foto ampliada.
 */
export function ImageViewer({
  image,
}: {
  image: NonNullable<Message["image"]>;
}): React.JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const photo = useRef<HTMLImageElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const pinch = useRef<{ distance: number; scale: number } | null>(null);
  const moved = useRef(false);
  const [view, setView] = useState<View>(INITIAL);
  const [dragging, setDragging] = useState(false);

  // Limita o arraste para a foto não sair da tela.
  function bounded(next: View): View {
    const box = stage.current?.getBoundingClientRect();
    const img = photo.current;
    if (!box || !img || next.scale <= MIN_SCALE) return INITIAL;
    const maxX = Math.max(0, (img.offsetWidth * next.scale - box.width) / 2);
    const maxY = Math.max(0, (img.offsetHeight * next.scale - box.height) / 2);
    return { scale: next.scale, x: clamp(next.x, -maxX, maxX), y: clamp(next.y, -maxY, maxY) };
  }

  /** Zoom mantendo fixo o ponto sob o cursor/dedos (coordenadas de tela). */
  function zoomTo(scale: number, at?: Point): void {
    setView((current) => {
      const next = clamp(scale, MIN_SCALE, MAX_SCALE);
      const box = stage.current?.getBoundingClientRect();
      if (!box || !at) return bounded({ ...current, scale: next });
      const px = at.x - (box.left + box.width / 2);
      const py = at.y - (box.top + box.height / 2);
      const ratio = next / current.scale;
      return bounded({
        scale: next,
        x: px - (px - current.x) * ratio,
        y: py - (py - current.y) * ratio,
      });
    });
  }

  function open(): void {
    setView(INITIAL);
    dialog.current?.showModal();
  }

  function onPointerDown(event: React.PointerEvent): void {
    if ((event.target as HTMLElement).closest("button")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    moved.current = false;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      if (a && b) pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), scale: view.scale };
    }
    setDragging(true);
  }

  function onPointerMove(event: React.PointerEvent): void {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    const current = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, current);
    const dx = current.x - previous.x;
    const dy = current.y - previous.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) moved.current = true;

    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      if (!a || !b) return;
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      zoomTo(pinch.current.scale * (distance / pinch.current.distance), {
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
      });
    } else if (pointers.current.size === 1 && view.scale > MIN_SCALE) {
      setView((v) => bounded({ ...v, x: v.x + dx, y: v.y + dy }));
    }
  }

  function onPointerUp(event: React.PointerEvent): void {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) setDragging(false);
    // Toque simples no fundo, sem zoom, fecha — como num visualizador comum.
    if (
      !moved.current &&
      view.scale === MIN_SCALE &&
      event.target === event.currentTarget &&
      pointers.current.size === 0
    ) {
      dialog.current?.close();
    }
  }

  function onKeyDown(event: React.KeyboardEvent): void {
    if (event.key === "+" || event.key === "=") zoomTo(view.scale + STEP);
    else if (event.key === "-") zoomTo(view.scale - STEP);
    else if (event.key === "0") setView(INITIAL);
    else return;
    event.preventDefault();
  }

  const control =
    "grid size-11 place-items-center rounded-full text-white hover:bg-white/15 disabled:opacity-40 disabled:hover:bg-transparent";

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="mb-1 block cursor-zoom-in rounded-xl"
        aria-label="Ampliar foto"
      >
        <Image
          src={image.thumbUrl}
          alt="Foto enviada na conversa"
          width={220}
          height={220}
          className="h-auto max-h-56 w-56 rounded-xl object-cover"
        />
      </button>
      <dialog
        ref={dialog}
        aria-label="Foto da conversa"
        onKeyDown={onKeyDown}
        className="m-0 h-dvh max-h-none w-screen max-w-none bg-transparent p-0 backdrop:bg-ink/90"
      >
        {/* biome-ignore lint/a11y/noStaticElementInteractions: gestos de mouse/toque; no teclado o zoom é pelos botões e pelas teclas + - 0 */}
        <div
          ref={stage}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={(event) =>
            zoomTo(view.scale * (event.deltaY < 0 ? 1.15 : 1 / 1.15), {
              x: event.clientX,
              y: event.clientY,
            })
          }
          onDoubleClick={(event) =>
            view.scale > MIN_SCALE
              ? setView(INITIAL)
              : zoomTo(2.5, { x: event.clientX, y: event.clientY })
          }
          className={cn(
            "flex size-full touch-none items-center justify-center overflow-hidden select-none",
            view.scale > MIN_SCALE && (dragging ? "cursor-grabbing" : "cursor-grab"),
          )}
        >
          <Image
            ref={photo}
            src={image.url}
            alt="Foto enviada na conversa"
            width={1600}
            height={1600}
            sizes="100vw"
            draggable={false}
            style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
            className={cn(
              "h-auto max-h-[calc(100dvh-7rem)] w-auto max-w-[calc(100vw-2rem)] rounded-xl object-contain",
              !dragging && "transition-transform duration-150",
            )}
          />
        </div>

        <button
          type="button"
          onClick={() => dialog.current?.close()}
          className="fixed top-4 right-4 grid size-11 place-items-center rounded-full bg-ink/60 text-white hover:bg-ink/80"
          aria-label="Fechar foto"
        >
          <X className="size-6" aria-hidden />
        </button>

        <div className="fixed bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-ink/70 px-2 py-1">
          <button
            type="button"
            onClick={() => zoomTo(view.scale - STEP)}
            disabled={view.scale <= MIN_SCALE}
            className={control}
            aria-label="Diminuir zoom"
          >
            <Minus className="size-5" aria-hidden />
          </button>
          <span
            className="w-14 text-center text-sm font-semibold text-white tabular-nums"
            aria-live="polite"
          >
            {Math.round(view.scale * 100)}%
          </span>
          <button
            type="button"
            onClick={() => zoomTo(view.scale + STEP)}
            disabled={view.scale >= MAX_SCALE}
            className={control}
            aria-label="Aumentar zoom"
          >
            <Plus className="size-5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setView(INITIAL)}
            disabled={view.scale === MIN_SCALE}
            className={control}
            aria-label="Restaurar tamanho"
          >
            <RotateCcw className="size-5" aria-hidden />
          </button>
        </div>
      </dialog>
    </>
  );
}
