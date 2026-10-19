"use client";

import { REPORT_REASON_LABELS } from "@repo/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import Image from "next/image";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { useState } from "react";
import { toast } from "sonner";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { timeAgo } from "@/lib/format";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import {
  decideAd,
  decideBuilding,
  getAdminAds,
  getAdminBuildings,
  getAdminReports,
  getAdminSettings,
  getAdminUsers,
  getMetrics,
  resolveReport,
  sanctionUser,
  updateAdminSetting,
} from "../api/admin-api";

const TABS = ["visao", "predios", "anuncios", "denuncias", "usuarios", "config"] as const;
const LABELS: Record<(typeof TABS)[number], string> = {
  visao: "Visão geral",
  predios: "Prédios",
  anuncios: "Anúncios",
  denuncias: "Denúncias",
  usuarios: "Usuários",
  config: "Configurações",
};

const fail = (error: unknown) =>
  toast.error(error instanceof ApiError ? error.message : "Não foi possível concluir.");
const askReason = (text: string) => window.prompt(text)?.trim() || null;

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <p className="text-sm text-ink-soft">{label}</p>
      <p className="mt-1 text-2xl font-extrabold tabular-nums">{value}</p>
      {hint && <p className="text-[0.8rem] text-muted">{hint}</p>}
    </div>
  );
}

function Overview() {
  const { data, isPending, isError } = useQuery({
    queryKey: ["admin", "metrics"],
    queryFn: getMetrics,
  });
  if (isPending) return <div className="h-40 animate-pulse rounded-2xl bg-sand" />;
  if (isError) return <Alert tone="error">Não foi possível carregar as métricas.</Alert>;
  const max = Math.max(1, ...data.adsByCategory.map((item) => item.total));
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Moradores ativos"
          value={data.users.active}
          hint={`${data.users.onboarding} no cadastro`}
        />
        <Stat
          label="Prédios verificados"
          value={data.buildings.verified}
          hint={`${data.buildings.review} em revisão`}
        />
        <Stat
          label="Anúncios ativos"
          value={data.ads.active}
          hint={`${Math.round(data.ads.aiGeneratedShare * 100)}% criados com IA`}
        />
        <Stat label="Conversas (30 dias)" value={data.conversations30d} />
        <Stat label="Em moderação" value={data.ads.moderation} />
        <Stat label="Denúncias abertas" value={data.reportsOpen} />
        <Stat
          label="Suspensos / banidos"
          value={`${data.users.suspended} / ${data.users.banned}`}
        />
        <Stat
          label="Chamadas de IA (30 dias)"
          value={data.ai30d.calls}
          hint={`${data.ai30d.failures} falhas, ${(data.ai30d.tokensIn + data.ai30d.tokensOut).toLocaleString("pt-BR")} tokens`}
        />
      </div>
      <section className="rounded-2xl border border-line bg-white p-5">
        <h2 className="mb-4 font-bold">Anúncios ativos por categoria</h2>
        <ul className="flex flex-col gap-2">
          {data.adsByCategory.map((item) => (
            <li
              key={item.category}
              className="grid grid-cols-[10rem_1fr_3rem] items-center gap-3 text-sm"
            >
              <span className="truncate text-ink-soft">{item.category}</span>
              <span className="h-2.5 rounded-full bg-sand">
                <span
                  className="block h-full rounded-full bg-brand"
                  style={{ width: `${(item.total / max) * 100}%` }}
                />
              </span>
              <span className="text-right font-semibold tabular-nums">{item.total}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function BuildingsQueue() {
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery({
    queryKey: ["admin", "buildings"],
    queryFn: () => getAdminBuildings(),
  });
  const decide = useMutation({
    mutationFn: ({
      id,
      decision,
      reason,
    }: {
      id: string;
      decision: "verificado" | "rejeitado";
      reason?: string;
    }) => decideBuilding(id, { decision, reason }),
    onSuccess: () => {
      toast.success("Decisão registrada");
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: fail,
  });
  if (isPending) return <div className="h-40 animate-pulse rounded-2xl bg-sand" />;
  if (!data?.length) return <p className="text-ink-soft">Nenhum prédio aguardando revisão.</p>;
  return (
    <ul className="flex flex-col gap-4">
      {data.map((building) => (
        <li
          key={building.id}
          className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-lg font-bold">{building.name}</p>
              <p className="text-sm text-ink-soft">
                {building.address}, CEP {building.cep}
              </p>
              <p className="text-sm text-muted">
                Cadastrado por {building.creatorName ?? "conta removida"}{" "}
                {timeAgo(building.createdAt)}, {building.residents} morador(es)
              </p>
            </div>
            <a
              href={`https://www.openstreetmap.org/?mlat=${building.lat}&mlon=${building.lng}#map=19/${building.lat}/${building.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm font-semibold text-brand-dark hover:underline"
            >
              Ver no mapa <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </div>
          {building.verification && (
            <div className="grid gap-3 rounded-xl bg-sand p-3 text-sm sm:grid-cols-2">
              <div>
                <p className="font-semibold">
                  Score {building.verification.score ?? "—"} ({building.verification.decidedBy})
                </p>
                <ul className="mt-1 list-disc pl-5 text-ink-soft">
                  {building.verification.evidence.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                  {!building.verification.evidence.length && <li>Sem evidências coletadas</li>}
                </ul>
              </div>
              {building.verification.risks.length > 0 && (
                <div>
                  <p className="font-semibold text-danger-dark">Sinais de risco</p>
                  <ul className="mt-1 list-disc pl-5 text-ink-soft">
                    {building.verification.risks.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={decide.isPending}
              onClick={() => decide.mutate({ id: building.id, decision: "verificado" })}
            >
              Verificar
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={decide.isPending}
              onClick={() => {
                const reason = askReason("Motivo para o morador (ex.: endereço não confere):");
                if (reason) decide.mutate({ id: building.id, decision: "rejeitado", reason });
              }}
            >
              Recusar
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function AdsQueue() {
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery({
    queryKey: ["admin", "ads"],
    queryFn: () => getAdminAds(),
  });
  const decide = useMutation({
    mutationFn: ({
      id,
      decision,
      reason,
    }: {
      id: string;
      decision: "aprovar" | "remover";
      reason?: string;
    }) => decideAd(id, { decision, reason }),
    onSuccess: () => {
      toast.success("Decisão registrada");
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: fail,
  });
  if (isPending) return <div className="h-40 animate-pulse rounded-2xl bg-sand" />;
  if (!data?.length) return <p className="text-ink-soft">Nenhum anúncio aguardando moderação.</p>;
  return (
    <ul className="flex flex-col gap-4">
      {data.map((ad) => (
        <li key={ad.id} className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-5">
          <div className="flex gap-4">
            {ad.thumbUrls[0] && (
              <span className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-sand">
                <Image src={ad.thumbUrls[0]} alt="" fill sizes="80px" className="object-cover" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="font-bold">{ad.title}</p>
              <p className="text-sm text-muted">
                {ad.sellerName}, {ad.buildingName}, {timeAgo(ad.createdAt)}
                {ad.reportCount > 0 && `, ${ad.reportCount} denúncia(s)`}
              </p>
              <p className="mt-2 line-clamp-3 text-sm text-ink-soft">{ad.description}</p>
            </div>
          </div>
          {(ad.statusReason || ad.lastModeration) && (
            <p className="rounded-xl bg-warn-soft p-3 text-sm text-warn">
              {ad.statusReason ??
                `${ad.lastModeration?.decidedBy}: ${ad.lastModeration?.reason ?? ad.lastModeration?.decision}`}
              {ad.lastModeration?.categories.length
                ? ` (${ad.lastModeration.categories.join(", ")})`
                : ""}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={decide.isPending}
              onClick={() => decide.mutate({ id: ad.id, decision: "aprovar" })}
            >
              Aprovar
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={decide.isPending}
              onClick={() => {
                const reason = askReason("Motivo para o anunciante:");
                if (reason) decide.mutate({ id: ad.id, decision: "remover", reason });
              }}
            >
              Remover
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function ReportsQueue() {
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery({
    queryKey: ["admin", "reports"],
    queryFn: getAdminReports,
  });
  const resolve = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "procedente" | "improcedente" }) =>
      resolveReport(id, { status }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin"] }),
    onError: fail,
  });
  const sanction = useMutation({
    mutationFn: ({
      userId,
      reportId,
      reason,
    }: {
      userId: string;
      reportId: string;
      reason: string;
    }) => sanctionUser(userId, { reason, reportId }),
    onSuccess: ({ type }) => {
      toast.success(`Sanção aplicada: ${type}`);
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: fail,
  });
  if (isPending) return <div className="h-40 animate-pulse rounded-2xl bg-sand" />;
  if (!data?.length) return <p className="text-ink-soft">Nenhuma denúncia aberta.</p>;
  return (
    <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-white">
      {data.map((report) => (
        <li key={report.id} className="flex flex-col gap-2 p-4">
          <p className="text-sm text-muted">
            {report.targetType === "ad"
              ? "Anúncio"
              : report.targetType === "user"
                ? "Pessoa"
                : report.targetType === "message"
                  ? "Mensagem"
                  : report.targetType === "referral"
                    ? "Indicação de prestador"
                    : "Prédio"}
            {report.sameTargetOpen > 1 && `, ${report.sameTargetOpen} denúncias sobre o mesmo item`}
          </p>
          <p className="font-semibold">
            {report.targetType === "ad" ? (
              <a href={`/anuncios/${report.targetId}`} className="hover:underline">
                {report.targetLabel}
              </a>
            ) : (
              report.targetLabel
            )}
          </p>
          <p className="text-sm">
            <span className="font-semibold">{REPORT_REASON_LABELS[report.reason]}</span>
            {report.details && `: ${report.details}`}
          </p>
          <p className="text-[0.8rem] text-muted">
            Por {report.reporterName ?? "conta removida"}, {timeAgo(report.createdAt)}
          </p>
          <div className="flex flex-wrap gap-2">
            {report.targetUserId && (
              <Button
                size="sm"
                variant="danger"
                disabled={sanction.isPending}
                onClick={() => {
                  const reason = askReason("Motivo da sanção (o usuário vê esta mensagem):");
                  if (reason && report.targetUserId)
                    sanction.mutate({ userId: report.targetUserId, reportId: report.id, reason });
                }}
              >
                Procedente + sancionar
              </Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              disabled={resolve.isPending}
              onClick={() => resolve.mutate({ id: report.id, status: "procedente" })}
            >
              Procedente
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={resolve.isPending}
              onClick={() => resolve.mutate({ id: report.id, status: "improcedente" })}
            >
              Improcedente
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function UsersTab() {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const q = useDebouncedValue(text, 400);
  const { data, isPending } = useQuery({
    queryKey: ["admin", "users", q],
    queryFn: () => getAdminUsers(q || undefined),
  });
  const sanction = useMutation({
    mutationFn: ({ id, reason, grave }: { id: string; reason: string; grave: boolean }) =>
      sanctionUser(id, { reason, grave }),
    onSuccess: ({ type }) => {
      toast.success(`Sanção aplicada: ${type}`);
      void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: fail,
  });
  return (
    <div className="flex flex-col gap-4">
      <label htmlFor="admin-user-search" className="sr-only">
        Buscar por nome ou e-mail
      </label>
      <Input
        id="admin-user-search"
        type="search"
        placeholder="Buscar por nome ou e-mail"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      {isPending ? (
        <div className="h-40 animate-pulse rounded-2xl bg-sand" />
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-white">
          {data?.map((user) => (
            <li key={user.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {user.name} <span className="font-normal text-muted">({user.status})</span>
                </p>
                <p className="truncate text-sm text-ink-soft">{user.email}</p>
                <p className="text-[0.8rem] text-muted">
                  {user.activeAds} anúncio(s) ativo(s), {user.openReports} denúncia(s) aberta(s),{" "}
                  {user.sanctions.length} sanção(ões)
                </p>
              </div>
              {user.role !== "platform_admin" && user.status !== "banido" && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={sanction.isPending}
                    onClick={() => {
                      const reason = askReason(
                        "Motivo (próximo nível: aviso → suspensão → banimento):",
                      );
                      if (reason) sanction.mutate({ id: user.id, reason, grave: false });
                    }}
                  >
                    Sancionar
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={sanction.isPending}
                    onClick={() => {
                      const reason = askReason(
                        "Infração grave (golpe, conteúdo ilegal). Motivo do banimento:",
                      );
                      if (reason) sanction.mutate({ id: user.id, reason, grave: true });
                    }}
                  >
                    Banir
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SettingsTab() {
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery({
    queryKey: ["admin", "settings"],
    queryFn: getAdminSettings,
  });
  const save = useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) => updateAdminSetting(key, value),
    onSuccess: () => {
      toast.success("Configuração salva");
      void queryClient.invalidateQueries({ queryKey: ["admin", "settings"] });
    },
    onError: fail,
  });
  if (isPending) return <div className="h-40 animate-pulse rounded-2xl bg-sand" />;
  return (
    <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-white">
      {data?.map((setting) => {
        const isList = Array.isArray(setting.defaultValue);
        const current = isList ? (setting.value as number[]).join(", ") : String(setting.value);
        return (
          <li key={setting.key} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="font-mono text-sm">{setting.key}</p>
              <p className="text-[0.8rem] text-muted">
                Padrão:{" "}
                {isList
                  ? (setting.defaultValue as number[]).join(", ")
                  : String(setting.defaultValue)}
              </p>
            </div>
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const raw = String(new FormData(event.currentTarget).get("value") ?? "");
                const value = isList
                  ? raw.split(",").map((part) => Number(part.trim().replace(",", ".")))
                  : Number(raw.replace(",", "."));
                save.mutate({ key: setting.key, value });
              }}
            >
              <Input
                name="value"
                defaultValue={current}
                aria-label={setting.key}
                className="min-h-10 w-40"
              />
              <Button type="submit" size="sm" variant="secondary" disabled={save.isPending}>
                Salvar
              </Button>
            </form>
          </li>
        );
      })}
    </ul>
  );
}

export function AdminPanel(): React.JSX.Element {
  const [tab, setTab] = useQueryState("aba", parseAsStringLiteral(TABS).withDefault("visao"));
  return (
    <div className="flex flex-col gap-6">
      <div
        role="tablist"
        aria-label="Seções do painel"
        className="-mx-5 flex gap-1 overflow-x-auto px-5 [scrollbar-width:none]"
      >
        {TABS.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => void setTab(key)}
            className={cn(
              "shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors",
              tab === key ? "bg-ink text-white" : "bg-white text-ink-soft hover:text-ink",
            )}
          >
            {LABELS[key]}
          </button>
        ))}
      </div>
      {tab === "visao" && <Overview />}
      {tab === "predios" && <BuildingsQueue />}
      {tab === "anuncios" && <AdsQueue />}
      {tab === "denuncias" && <ReportsQueue />}
      {tab === "usuarios" && <UsersTab />}
      {tab === "config" && <SettingsTab />}
    </div>
  );
}
