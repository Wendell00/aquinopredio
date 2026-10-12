"use client";

import { useEffect, useState } from "react";

interface Example {
  label: string;
  photo: string;
  input: string;
  output: {
    title: string;
    description: string;
    category: string;
    type: string;
    price: string;
    tags: string[];
    confirm?: string;
  };
}

const EXAMPLES: [Example, ...Example[]] = [
  {
    label: "Bolo de pote",
    photo: "🍰",
    input: "faço bolo de pote 10 reais, tem chocolate e ninho, entrego no ap",
    output: {
      title: "Bolo de pote caseiro — chocolate e ninho",
      description:
        "Bolos de pote feitos em casa, com sabores chocolate e leite ninho. Entrego direto no seu apartamento, sem taxa. É só me chamar para encomendar!",
      category: "Alimentação",
      type: "Produto",
      price: "R$ 10,00",
      tags: ["bolo", "doce", "caseiro", "entrega no prédio"],
      confirm: "Dias e horários de entrega",
    },
  },
  {
    label: "Manicure",
    photo: "💅",
    input: "sou manicure, atendo em casa ou vou até vc, pé e mão 60",
    output: {
      title: "Manicure e pedicure — atendo em casa ou no seu apê",
      description:
        "Serviço de manicure e pedicure com atendimento no meu apartamento ou no seu, sem você precisar sair do prédio. Pé e mão por R$ 60.",
      category: "Beleza e Estética",
      type: "Serviço",
      price: "R$ 60,00 (pé e mão)",
      tags: ["manicure", "pedicure", "unhas", "a domicílio"],
      confirm: "Disponibilidade de horários",
    },
  },
  {
    label: "Sofá usado",
    photo: "🛋️",
    input: "vendo sofa 3 lugares cinza, 2 anos de uso, 700 reais, retirar no ap",
    output: {
      title: "Sofá 3 lugares cinza — 2 anos de uso",
      description:
        "Sofá de 3 lugares na cor cinza, com 2 anos de uso. Valor de R$ 700. Retirada no meu apartamento, aqui no prédio — sem frete e sem complicação.",
      category: "Casa e Decoração",
      type: "Produto",
      price: "R$ 700,00",
      tags: ["sofá", "móveis", "usado"],
      confirm: "Medidas e estado de conservação",
    },
  },
  {
    label: "Procuro diarista",
    photo: "🧹",
    input: "procuro diarista p/ sexta feira, apartamento 2 quartos",
    output: {
      title: "Procuro diarista para as sextas-feiras",
      description:
        "Procuro diarista para limpeza semanal às sextas-feiras em apartamento de 2 quartos. Preferência por quem já trabalha aqui no prédio ou nos vizinhos.",
      category: "Limpeza e Organização",
      type: "Procura",
      price: "A combinar",
      tags: ["diarista", "limpeza", "semanal"],
    },
  },
];

type Phase = "idle" | "loading" | "done";

const panel = "rounded-card border border-line bg-cream p-6";
const panelLabel = "mb-3 text-[0.78rem] font-bold uppercase tracking-[0.06em] text-muted";
const note = "mt-3 text-[0.82rem] text-muted";

const SKELETON = [
  { id: "photo", size: "h-[120px]" },
  { id: "title", size: "h-[18px]" },
  { id: "line1", size: "h-[18px] w-[70%]" },
  { id: "line2", size: "h-[18px]" },
];

export function AiDemo(): React.JSX.Element {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const example = EXAMPLES[index] ?? EXAMPLES[0];

  useEffect(() => {
    if (phase !== "loading") return;
    const t = setTimeout(() => {
      setPhase("done");
    }, 1400);
    return () => {
      clearTimeout(t);
    };
  }, [phase]);

  return (
    <div className="mt-9 grid items-start gap-4 lg:grid-cols-2">
      <div className={panel}>
        <div className="mb-6 flex flex-wrap gap-2" role="tablist">
          {EXAMPLES.map((ex, i) => (
            <button
              aria-selected={i === index}
              className={`min-h-10 cursor-pointer rounded-full border-[1.5px] px-3.5 text-[0.9rem] font-semibold transition ${
                i === index
                  ? "border-ink bg-ink text-white"
                  : "border-line bg-white text-ink hover:border-brand"
              }`}
              key={ex.label}
              onClick={() => {
                setIndex(i);
                setPhase("idle");
              }}
              role="tab"
              type="button"
            >
              {ex.photo} {ex.label}
            </button>
          ))}
        </div>

        <p className={panelLabel}>O que o morador enviou</p>
        <div className="flex items-start gap-3 rounded-[16px_16px_16px_4px] border border-line bg-white p-3.5">
          <div className="grid size-16 flex-none place-items-center rounded-xl bg-brand-soft text-[2rem]">
            {example.photo}
          </div>
          <p className="text-[1.02rem]">“{example.input}”</p>
        </div>

        <button
          className="mt-5 min-h-13 w-full cursor-pointer rounded-full bg-brand font-bold text-white transition hover:bg-brand-dark disabled:cursor-progress disabled:opacity-70"
          disabled={phase === "loading"}
          onClick={() => {
            setPhase("loading");
          }}
          type="button"
        >
          {phase === "loading" ? "Criando anúncio…" : "✨ Criar anúncio com IA"}
        </button>
        <p className={note}>Simulação. No app, a IA usa o seu texto e as suas fotos de verdade.</p>
      </div>

      <div aria-live="polite" className={panel}>
        <p className={panelLabel}>Rascunho gerado</p>
        {phase === "idle" && (
          <div className="grid min-h-[260px] place-items-center rounded-[14px] border-2 border-dashed border-line p-6 text-center text-muted">
            <p>
              Clique em <strong>Criar anúncio com IA</strong> para ver o resultado.
            </p>
          </div>
        )}
        {phase === "loading" && (
          <div className="grid min-h-[260px] content-start gap-3">
            {SKELETON.map((row) => (
              <span
                className={`${row.size} animate-shimmer rounded-lg bg-[linear-gradient(90deg,var(--color-line),#f8f1ea,var(--color-line))] bg-size-[200%_100%]`}
                key={row.id}
              />
            ))}
          </div>
        )}
        {phase === "done" && (
          <article className="animate-rise overflow-hidden rounded-2xl bg-white shadow-soft">
            <div className="grid h-[120px] place-items-center bg-brand-soft text-[3.4rem]">
              {example.photo}
            </div>
            <div className="p-[18px]">
              <div className="flex flex-wrap gap-1.5">
                {[example.output.type, example.output.category].map((m) => (
                  <span
                    className="rounded-full bg-leaf-soft px-2.5 py-0.5 text-xs font-semibold text-leaf"
                    key={m}
                  >
                    {m}
                  </span>
                ))}
              </div>
              <h3 className="my-2 text-lg font-bold leading-tight">{example.output.title}</h3>
              <p className="text-[0.95rem] text-ink-soft">{example.output.description}</p>
              <p className="mt-2.5 text-lg font-extrabold text-brand-dark">
                {example.output.price}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[0.82rem] text-muted">
                {example.output.tags.map((t) => (
                  <span key={t}>#{t}</span>
                ))}
              </div>
              {example.output.confirm ? (
                <p className="mt-3 rounded-[10px] bg-warn-soft px-3 py-2 text-sm text-warn">
                  ⚠️ Confirme: {example.output.confirm.toLowerCase()} (a IA não inventa o que você
                  não informou)
                </p>
              ) : null}
              <div className="mt-4 flex gap-2 text-center text-[0.88rem] font-bold">
                <span className="flex-1 rounded-full border-[1.5px] border-line p-2.5">Editar</span>
                <span className="flex-1 rounded-full bg-ink p-2.5 text-white">
                  Revisar e publicar
                </span>
              </div>
            </div>
          </article>
        )}
      </div>
    </div>
  );
}
