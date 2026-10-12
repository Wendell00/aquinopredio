import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  NotificationSettings,
  NotificationsList,
} from "@/features/notifications/components/notifications-list";
import { getMe, getPublicConfig } from "@/lib/session/get-me";

export const metadata: Metadata = { title: "Notificações — Aqui no Prédio" };

export default async function NotificationsPage(): Promise<React.JSX.Element> {
  const [me, config] = await Promise.all([getMe(), getPublicConfig()]);
  if (!me) redirect("/entrar?next=/notificacoes");
  return (
    <main className="mx-auto flex max-w-[44rem] flex-col gap-6 px-5 py-8">
      <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-[-0.03em]">
        Notificações
      </h1>
      <NotificationsList />
      <NotificationSettings prefs={me.notificationPrefs} vapidPublicKey={config.vapidPublicKey} />
    </main>
  );
}
