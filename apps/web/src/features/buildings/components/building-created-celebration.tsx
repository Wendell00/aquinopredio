"use client";

import { Check } from "lucide-react";
import { parseAsString, useQueryState } from "nuqs";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/** Tempo até a comemoração sair sozinha — o suficiente para a animação terminar e o texto ser lido. */
const AUTO_DISMISS_MS = 5500;
/** Igual à duração do `fade-out` do overlay. */
const LEAVE_MS = 450;

const CONFETTI_COLORS = ["bg-brand", "bg-glow", "bg-leaf", "bg-brand-soft", "bg-brand-dark"];

// Posições determinísticas (sem Math.random) para o HTML do servidor bater com o do cliente.
const confetti = Array.from({ length: 32 }, (_, index) => {
  const angle = (index / 32) * Math.PI * 2 + (index % 3) * 0.2;
  const distance = 150 + ((index * 37) % 140);
  return {
    x: Math.round(Math.cos(angle) * distance),
    y: Math.round(Math.sin(angle) * distance - 40),
    r: ((index * 97) % 720) - 360,
    color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
    round: index % 4 === 0,
    delay: (index % 5) * 30,
  };
});

/** Janelas que acendem fora de ordem, como luzes de verdade numa noite. */
function Windows({ count, cols, start }: { count: number; cols: number; start: number }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {Array.from({ length: count }, (_, index) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: lista fixa e decorativa
          key={index}
          className="h-4 rounded-[3px] animate-[window-on_0.35s_ease-out_both]"
          style={{ animationDelay: `${start + ((index * 7) % count) * 70}ms` }}
        />
      ))}
    </div>
  );
}

function Tower({
  className,
  delay,
  children,
}: {
  className: string;
  delay: number;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex origin-bottom flex-col justify-start rounded-t-lg p-3 shadow-lift animate-[build-up_0.75s_cubic-bezier(0.34,1.4,0.64,1)_both]",
        className,
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

export function BuildingCreatedCelebration(): React.JSX.Element | null {
  const [cadastro, setCadastro] = useQueryState("cadastro", parseAsString);
  const [leaving, setLeaving] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const visible = cadastro === "predio";

  useEffect(() => {
    if (!visible) return;
    buttonRef.current?.focus();
    const timer = setTimeout(() => setLeaving(true), AUTO_DISMISS_MS);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLeaving(true);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
    };
  }, [visible]);

  useEffect(() => {
    if (!leaving) return;
    // Timer em vez de onAnimationEnd: com movimento reduzido a animação pode nem disparar o evento.
    const timer = setTimeout(() => void setCadastro(null), LEAVE_MS);
    return () => clearTimeout(timer);
  }, [leaving, setCadastro]);

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="building-created-title"
      aria-describedby="building-created-description"
      className={cn(
        "fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden px-6 text-center",
        "bg-[radial-gradient(circle_at_50%_38%,var(--color-brand-soft),var(--color-cream)_62%)]",
        leaving ? "animate-[fade-out_0.45s_ease-in_both]" : "animate-[fade-in_0.3s_ease-out_both]",
      )}
    >
      <div className="relative flex flex-col items-center">
        {/* Selo que pula no topo, com ondas e confete saindo dele */}
        <div className="relative z-10 mb-3 flex size-16 items-center justify-center">
          <span
            className="absolute inset-0 rounded-full border-4 border-leaf animate-[ring_1s_ease-out_both] [animation-delay:1900ms]"
            aria-hidden
          />
          <span
            className="absolute inset-0 rounded-full border-4 border-brand animate-[ring_1.2s_ease-out_both] [animation-delay:2100ms]"
            aria-hidden
          />
          {confetti.map((piece, index) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: lista fixa e decorativa
              key={index}
              aria-hidden
              className={cn(
                "absolute top-1/2 left-1/2 opacity-0 animate-[confetti_1.4s_cubic-bezier(0.15,0.7,0.3,1)_both]",
                piece.round ? "size-2.5 rounded-full" : "h-3.5 w-2 rounded-[2px]",
                piece.color,
              )}
              style={
                {
                  "--x": `${piece.x}px`,
                  "--y": `${piece.y}px`,
                  "--r": `${piece.r}deg`,
                  animationDelay: `${1900 + piece.delay}ms`,
                } as CSSProperties
              }
            />
          ))}
          <div className="animate-[pop_0.6s_cubic-bezier(0.34,1.56,0.64,1)_both] [animation-delay:1800ms]">
            <div className="flex size-16 items-center justify-center rounded-full bg-leaf text-white shadow-lift animate-[bob_2.4s_ease-in-out_infinite] [animation-delay:2500ms]">
              <Check className="size-9" strokeWidth={3} aria-hidden />
            </div>
          </div>
        </div>

        {/* Skyline: três prédios sobem do chão e as janelas acendem */}
        <div className="flex items-end gap-2" aria-hidden>
          <Tower className="h-28 w-20 bg-brand-dark" delay={350}>
            <Windows count={6} cols={2} start={1100} />
          </Tower>
          <Tower className="relative h-48 w-32 bg-brand" delay={200}>
            <Windows count={15} cols={3} start={950} />
            <span className="mx-auto mt-auto h-8 w-7 rounded-t-md bg-brand-dark" />
          </Tower>
          <Tower className="h-36 w-20 bg-leaf" delay={500}>
            <Windows count={8} cols={2} start={1250} />
          </Tower>
        </div>
        <span
          className="h-1.5 w-80 max-w-[85vw] rounded-full bg-ink/80 animate-[draw-x_0.6s_ease-out_both] [animation-delay:100ms]"
          aria-hidden
        />
      </div>

      <h2
        id="building-created-title"
        className="mt-10 text-4xl font-extrabold tracking-tight text-ink sm:text-5xl animate-[rise_0.6s_ease-out_both] [animation-delay:2200ms]"
      >
        Prédio cadastrado!
      </h2>
      <p
        id="building-created-description"
        className="mt-3 max-w-md text-lg text-ink-soft animate-[rise_0.6s_ease-out_both] [animation-delay:2400ms]"
      >
        Você já pode anunciar e convidar os vizinhos.
      </p>
      <button
        ref={buttonRef}
        type="button"
        className={cn(
          buttonClasses(),
          "mt-8 animate-[rise_0.6s_ease-out_both] [animation-delay:2600ms]",
        )}
        onClick={() => setLeaving(true)}
      >
        Começar
      </button>
    </div>
  );
}
