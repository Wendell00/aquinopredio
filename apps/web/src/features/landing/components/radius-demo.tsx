"use client";

import { useState } from "react";

const RADII = [0, 0.5, 1, 2, 3, 5];

// Prédios vizinhos fictícios: distância em km e ângulo em graus a partir do seu prédio.
const NEIGHBORS = [
  { name: "Ed. Jardins", km: 0.4, angle: 30 },
  { name: "Res. Aurora", km: 0.8, angle: 160 },
  { name: "Cond. Bela Vista", km: 1.2, angle: 250 },
  { name: "Ed. Horizonte", km: 1.7, angle: 330 },
  { name: "Res. Primavera", km: 2.6, angle: 95 },
  { name: "Cond. das Palmeiras", km: 2.9, angle: 205 },
  { name: "Ed. Atlântico", km: 3.8, angle: 300 },
  { name: "Res. Bosque", km: 4.6, angle: 60 },
  { name: "Cond. Serra Azul", km: 4.4, angle: 180 },
];

const chip = "rounded-full bg-leaf-soft px-2.5 py-1 text-[0.82rem] font-semibold text-leaf";

const SIZE = 340;
const CENTER = SIZE / 2;
const PX_PER_KM = 30;

function label(km: number): string {
  if (km === 0) return "Só meu prédio";
  return `${km.toLocaleString("pt-BR")} km`;
}

export function RadiusDemo(): React.JSX.Element {
  const [step, setStep] = useState(2);
  const radius = RADII[step] ?? 0;
  const visible = NEIGHBORS.filter((n) => n.km <= radius).length;

  return (
    <div className="mt-9 grid items-center gap-4 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="rounded-card border border-line bg-white bg-[linear-gradient(var(--color-line)_1px,transparent_1px),linear-gradient(90deg,var(--color-line)_1px,transparent_1px)] bg-size-[34px_34px] p-4">
        <svg
          aria-label={`Mapa ilustrativo: com raio de ${label(radius)}, ${visible + 1} prédios veem o anúncio`}
          className="mx-auto block w-full max-w-[420px]"
          role="img"
          viewBox={`0 0 ${SIZE} ${SIZE}`}
        >
          {[1, 2, 3, 4, 5].map((km) => (
            <circle
              className="fill-none stroke-[#e2d6cb] [stroke-dasharray:3_5]"
              cx={CENTER}
              cy={CENTER}
              key={km}
              r={km * PX_PER_KM}
            />
          ))}
          <circle
            className="fill-brand/10 stroke-brand stroke-2 transition-[r] duration-300"
            cx={CENTER}
            cy={CENTER}
            r={Math.max(radius * PX_PER_KM, 14)}
          />
          {NEIGHBORS.map((n) => {
            const rad = (n.angle * Math.PI) / 180;
            const x = CENTER + Math.cos(rad) * n.km * PX_PER_KM;
            const y = CENTER + Math.sin(rad) * n.km * PX_PER_KM;
            const on = n.km <= radius;
            return (
              <g key={n.name}>
                <rect
                  className={`transition-colors duration-300 ${on ? "fill-leaf" : "fill-[#cfc7c0]"}`}
                  height={16}
                  rx={3}
                  width={12}
                  x={x - 6}
                  y={y - 8}
                />
              </g>
            );
          })}
          <rect
            className="fill-brand"
            height={24}
            rx={4}
            width={18}
            x={CENTER - 9}
            y={CENTER - 12}
          />
        </svg>
      </div>

      <div className="rounded-card border border-line bg-cream p-6">
        <p className="mb-3 text-[0.78rem] font-bold uppercase tracking-[0.06em] text-muted">
          Raio do anúncio
        </p>
        <p className="text-[2rem] font-extrabold tracking-[-0.02em]">{label(radius)}</p>
        <input
          aria-label="Raio do anúncio"
          aria-valuetext={label(radius)}
          className="mt-3 h-8 w-full accent-brand"
          max={RADII.length - 1}
          min={0}
          onChange={(e) => {
            setStep(Number(e.target.value));
          }}
          step={1}
          type="range"
          value={step}
        />
        <div className="flex justify-between text-[0.8rem] text-muted">
          {RADII.map((r) => (
            <span key={r}>{r === 0 ? "0" : r.toLocaleString("pt-BR")}</span>
          ))}
        </div>
        <p className="mt-5 text-[1.05rem]">
          <strong className="text-[1.3rem] text-leaf">{visible + 1}</strong>{" "}
          {visible === 0 ? "prédio vê" : "prédios veem"} o seu anúncio
        </p>
        <ul className="mt-3 flex flex-wrap gap-1.5">
          <li className={chip}>🏠 Seu prédio</li>
          {NEIGHBORS.filter((n) => n.km <= radius)
            .sort((a, b) => a.km - b.km)
            .map((n) => (
              <li className={chip} key={n.name}>
                🏢 {n.name} · {n.km.toLocaleString("pt-BR")} km
              </li>
            ))}
        </ul>
        <p className="mt-3 text-[0.82rem] text-muted">Mapa ilustrativo.</p>
      </div>
    </div>
  );
}
