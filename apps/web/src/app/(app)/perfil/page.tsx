import { type MyBuilding, PLAN_LABELS } from "@repo/shared";
import {
  Bell,
  ChevronRight,
  Download,
  Heart,
  Megaphone,
  Shield,
  Sparkles,
  Trash2,
  UserX,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { MyBuildings } from "@/features/profile/components/my-buildings";
import { ProfileForm } from "@/features/profile/components/profile-form";
import { serverGet } from "@/lib/api/server";
import { getMe } from "@/lib/session/get-me";

export const metadata: Metadata = { title: "Perfil — Aqui no Prédio" };

const LINKS = [
  { href: "/meus-anuncios", label: "Meus anúncios", icon: Megaphone },
  { href: "/plano", label: "Seu plano", icon: Sparkles },
  { href: "/favoritos", label: "Favoritos", icon: Heart },
  { href: "/notificacoes", label: "Notificações", icon: Bell },
  { href: "/perfil/bloqueados", label: "Pessoas bloqueadas", icon: UserX },
];

export default async function ProfilePage(): Promise<React.JSX.Element> {
  const [me, buildings] = await Promise.all([getMe(), serverGet<MyBuilding[]>("/me/buildings")]);
  if (!me) redirect("/entrar?next=/perfil");

  return (
    <main className="mx-auto flex max-w-[44rem] flex-col gap-8 px-5 py-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-[-0.03em]">Perfil</h1>
        <SignOutButton />
      </div>

      <section className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-5">
        <h2 className="text-lg font-extrabold">Seus dados</h2>
        <ProfileForm me={me} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-extrabold">Seus prédios</h2>
        <MyBuildings initial={buildings ?? []} max={3} />
      </section>

      <nav aria-label="Atalhos do perfil">
        <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
          {[
            ...LINKS,
            ...(me.role === "platform_admin"
              ? [{ href: "/admin", label: "Painel da plataforma", icon: Shield }]
              : []),
          ].map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                className="flex items-center gap-3 px-4 py-3.5 font-semibold hover:bg-sand/60"
              >
                <Icon className="size-5 text-ink-soft" aria-hidden />
                <span className="flex-1">{label}</span>
                {href === "/plano" && (
                  <span className="rounded-full bg-sand px-2 py-0.5 text-[0.75rem] font-bold text-ink-soft">
                    {PLAN_LABELS[me.plan]}
                  </span>
                )}
                <ChevronRight className="size-4 text-muted" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-extrabold">Privacidade</h2>
        <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
          <li>
            <a
              href="/api/me/export"
              className="flex items-center gap-3 px-4 py-3.5 font-semibold hover:bg-sand/60"
            >
              <Download className="size-5 text-ink-soft" aria-hidden />
              <span className="flex-1">Baixar meus dados</span>
            </a>
          </li>
          <li>
            <Link
              href="/perfil/excluir"
              className="flex items-center gap-3 px-4 py-3.5 font-semibold text-danger hover:bg-danger-soft"
            >
              <Trash2 className="size-5" aria-hidden />
              <span className="flex-1">Excluir conta</span>
            </Link>
          </li>
        </ul>
        <p className="text-sm text-muted">
          <Link href="/termos" className="underline">
            Termos de Uso
          </Link>{" "}
          e{" "}
          <Link href="/privacidade" className="underline">
            Política de Privacidade
          </Link>
        </p>
      </section>
    </main>
  );
}
