"use client";

import {
  type BuildingAdminView,
  type BuildingMember,
  JOIN_POLICY_LABELS,
  type MemberAction,
} from "@repo/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, EyeOff } from "lucide-react";
import Link from "next/link";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { toast } from "sonner";
import { BuildingPlate } from "@/components/building-plate";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { timeAgo } from "@/lib/format";
import {
  getBuildingAdmin,
  getBuildingAds,
  hideBuildingAd,
  memberAction,
  resign,
  setJoinPolicy,
} from "../api/building-admin-api";

const TABS = ["moradores", "anuncios", "configuracoes"] as const;
const TAB_LABELS: Record<(typeof TABS)[number], string> = {
  moradores: "Moradores",
  anuncios: "Anúncios",
  configuracoes: "Configurações",
};

const fail = (error: unknown) =>
  toast.error(error instanceof ApiError ? error.message : "Não foi possível concluir.");

function MemberRow({
  member,
  buildingId,
}: {
  member: BuildingMember;
  buildingId: string;
}): React.JSX.Element {
  const queryClient = useQueryClient();
  const action = useMutation({
    mutationFn: (kind: MemberAction) => memberAction(buildingId, member.membershipId, kind),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["building-admin", buildingId] }),
    onError: fail,
  });
  const run = (kind: MemberAction, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    action.mutate(kind);
  };

  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 font-semibold">
          {member.name}
          {member.verified && <BadgeCheck className="size-4 text-leaf" aria-label="Verificado" />}
          {member.role === "admin" && (
            <span className="rounded-full bg-sand px-2 text-[0.72rem] font-bold text-ink-soft">
              Admin
            </span>
          )}
          {member.isMe && <span className="text-sm font-normal text-muted">(você)</span>}
        </p>
        <p className="text-sm text-ink-soft">
          Unidade {member.unit}
          {member.status === "pendente" && `, pediu para entrar ${timeAgo(member.requestedAt)}`}
        </p>
      </div>
      {!member.isMe && (
        <div className="flex flex-wrap gap-2">
          {member.status === "pendente" ? (
            <>
              <Button size="sm" disabled={action.isPending} onClick={() => run("aprovar")}>
                Aprovar
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={action.isPending}
                onClick={() => run("recusar")}
              >
                Recusar
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                variant="secondary"
                disabled={action.isPending}
                onClick={() => run(member.verified ? "remover_selo" : "verificar")}
              >
                {member.verified ? "Tirar selo" : "Dar selo de verificado"}
              </Button>
              {member.role !== "admin" && member.verified && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={action.isPending}
                  onClick={() =>
                    run("promover", `Tornar ${member.name} administrador(a) do prédio?`)
                  }
                >
                  Tornar admin
                </Button>
              )}
              {member.role !== "admin" && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={action.isPending}
                  onClick={() =>
                    run(
                      "remover",
                      `Remover ${member.name} do prédio? Os anúncios dele(a) aqui serão pausados.`,
                    )
                  }
                >
                  Remover
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </li>
  );
}

function AdsTab({ buildingId }: { buildingId: string }): React.JSX.Element {
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery({
    queryKey: ["building-admin", buildingId, "ads"],
    queryFn: () => getBuildingAds(buildingId),
  });
  const hide = useMutation({
    mutationFn: (adId: string) => hideBuildingAd(buildingId, adId),
    onSuccess: () => {
      toast.success("Anúncio ocultado e enviado para revisão da equipe");
      void queryClient.invalidateQueries({ queryKey: ["building-admin", buildingId, "ads"] });
    },
    onError: fail,
  });
  if (isPending) return <div className="h-32 animate-pulse rounded-2xl bg-sand" />;
  if (!data?.length)
    return <p className="text-ink-soft">Nenhum anúncio publicado a partir deste prédio.</p>;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-soft">
        Você pode ocultar anúncios publicados neste prédio. Eles vão para a revisão da equipe do
        Aqui no Prédio.
      </p>
      <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-white">
        {data.map((ad) => (
          <li key={ad.id} className="flex items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <Link
                href={`/anuncios/${ad.id}`}
                className="block truncate font-semibold hover:underline"
              >
                {ad.title}
              </Link>
              <p className="text-sm text-ink-soft">
                {ad.sellerName}
                {ad.reportCount > 0 && `, ${ad.reportCount} denúncia(s)`}
                {ad.status !== "ativo" &&
                  `, ${ad.status === "em_moderacao" ? "em revisão" : "pausado"}`}
              </p>
            </div>
            {ad.status !== "em_moderacao" && (
              <Button
                size="sm"
                variant="ghost"
                disabled={hide.isPending}
                onClick={() =>
                  window.confirm("Ocultar este anúncio e enviar para revisão?") &&
                  hide.mutate(ad.id)
                }
              >
                <EyeOff className="size-4" aria-hidden /> Ocultar
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SettingsTab({ view }: { view: BuildingAdminView }): React.JSX.Element {
  const queryClient = useQueryClient();
  const id = view.building.id;
  const policy = useMutation({
    mutationFn: (joinPolicy: BuildingAdminView["building"]["joinPolicy"]) =>
      setJoinPolicy(id, joinPolicy),
    onSuccess: () => {
      toast.success("Política de entrada atualizada");
      void queryClient.invalidateQueries({ queryKey: ["building-admin", id] });
    },
    onError: fail,
  });
  const leave = useMutation({
    mutationFn: () => resign(id),
    onSuccess: () => {
      toast.success("Você deixou de ser administrador");
      window.location.assign("/perfil");
    },
    onError: fail,
  });
  return (
    <div className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-2 rounded-2xl border border-line bg-white p-5">
        <legend className="sr-only">Quem pode entrar no prédio</legend>
        <p className="font-bold">Quem pode entrar</p>
        {(["automatica", "aprovacao_admin"] as const).map((option) => (
          <label
            key={option}
            className="flex cursor-pointer items-start gap-3 rounded-xl px-1 py-2"
          >
            <input
              type="radio"
              name="join-policy"
              className="mt-1 accent-brand"
              checked={view.building.joinPolicy === option}
              onChange={() => policy.mutate(option)}
            />
            <span>
              <span className="block font-semibold">{JOIN_POLICY_LABELS[option]}</span>
              <span className="text-sm text-ink-soft">
                {option === "automatica"
                  ? "Quem informar a unidade entra na hora."
                  : `Você aprova cada pedido. Sem resposta em ${view.autoApproveDays} dias, o pedido é aprovado automaticamente.`}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      <section className="flex flex-col gap-2 rounded-2xl border border-line bg-white p-5">
        <p className="font-bold">Administradores</p>
        <p className="text-sm text-ink-soft">
          O prédio tem {view.admins} de {view.maxAdmins} administradores. Para nomear outro, dê o
          selo de verificado ao morador e use “Tornar admin”.
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          loading={leave.isPending}
          onClick={() =>
            window.confirm("Deixar de ser administrador deste prédio?") && leave.mutate()
          }
        >
          Deixar de ser administrador
        </Button>
      </section>
    </div>
  );
}

export function BuildingAdminPanel({ initial }: { initial: BuildingAdminView }): React.JSX.Element {
  const [tab, setTab] = useQueryState("aba", parseAsStringLiteral(TABS).withDefault("moradores"));
  const { data: view } = useQuery({
    queryKey: ["building-admin", initial.building.id],
    queryFn: () => getBuildingAdmin(initial.building.id),
    initialData: initial,
  });
  const pending = view.members.filter((member) => member.status === "pendente");
  const active = view.members.filter((member) => member.status === "ativo");

  return (
    <div className="flex flex-col gap-6">
      <BuildingPlate
        size="lg"
        name={view.building.name}
        detail={`${view.building.district}, ${view.building.city}`}
      />
      <div role="tablist" aria-label="Seções" className="flex gap-1 rounded-full bg-sand p-1">
        {TABS.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => void setTab(key)}
            className={cn(
              "flex-1 rounded-full px-3 py-2 text-sm font-semibold transition-colors",
              tab === key ? "bg-white text-ink shadow-sm" : "text-ink-soft hover:text-ink",
            )}
          >
            {TAB_LABELS[key]}
            {key === "moradores" && pending.length > 0 && ` (${pending.length})`}
          </button>
        ))}
      </div>

      {tab === "moradores" && (
        <div className="flex flex-col gap-6">
          {pending.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="font-bold">Pedidos para entrar</h2>
              <ul className="flex flex-col divide-y divide-line rounded-2xl border border-brand/30 bg-white">
                {pending.map((member) => (
                  <MemberRow
                    key={member.membershipId}
                    member={member}
                    buildingId={view.building.id}
                  />
                ))}
              </ul>
            </section>
          )}
          <section className="flex flex-col gap-2">
            <h2 className="font-bold">Moradores ({active.length})</h2>
            <p className="text-sm text-ink-soft">
              As unidades só aparecem para administradores. O selo de verificado libera alcance
              maior nos anúncios.
            </p>
            <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-white">
              {active.map((member) => (
                <MemberRow
                  key={member.membershipId}
                  member={member}
                  buildingId={view.building.id}
                />
              ))}
            </ul>
          </section>
        </div>
      )}
      {tab === "anuncios" && <AdsTab buildingId={view.building.id} />}
      {tab === "configuracoes" && <SettingsTab view={view} />}
    </div>
  );
}
