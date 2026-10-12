"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useUnread } from "../hooks/use-unread";

export function NotificationBell(): React.JSX.Element {
  const { data } = useUnread();
  const count = data?.notifications ?? 0;
  return (
    <Link
      href="/notificacoes"
      className="relative grid size-11 shrink-0 place-items-center rounded-full border border-line bg-white hover:bg-sand"
      aria-label={count ? `Notificações, ${count} não lidas` : "Notificações"}
    >
      <Bell className="size-5" aria-hidden />
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-brand px-1 text-[0.7rem] font-bold text-white">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}
