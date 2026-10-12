"use client";

import {
  type AppNotification,
  NOTIFICATION_TYPE_LABELS,
  type NotificationPrefs,
  notificationTypeSchema,
} from "@repo/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { timeAgo } from "@/lib/format";
import { disablePush, enablePush, pushEnabled, pushSupported } from "@/lib/pwa/push";
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  updateNotificationPrefs,
} from "../api/notifications-api";
import { unreadKey } from "../hooks/use-unread";

export function NotificationsList(): React.JSX.Element {
  const queryClient = useQueryClient();
  const { data, isPending, isError } = useQuery({
    queryKey: ["notifications"],
    queryFn: getNotifications,
  });
  const readAll = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      queryClient.setQueryData<AppNotification[]>(["notifications"], (list) =>
        list?.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })),
      );
      void queryClient.invalidateQueries({ queryKey: unreadKey });
    },
  });

  if (isPending) return <div className="h-40 animate-pulse rounded-2xl bg-sand" />;
  if (isError) return <Alert tone="error">Não foi possível carregar as notificações.</Alert>;
  const hasUnread = data.some((item) => !item.readAt);

  return (
    <div className="flex flex-col gap-3">
      {hasUnread && (
        <Button
          variant="ghost"
          size="sm"
          className="self-end"
          onClick={() => readAll.mutate()}
          loading={readAll.isPending}
        >
          Marcar todas como lidas
        </Button>
      )}
      {data.length === 0 ? (
        <div className="flex flex-col items-start gap-2 rounded-2xl border border-dashed border-edge/50 p-6">
          <Bell className="size-7 text-muted" aria-hidden />
          <p className="font-bold">Tudo em dia</p>
          <p className="text-ink-soft">
            Avisos sobre mensagens, anúncios e o seu prédio aparecem aqui.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
          {data.map((item) => (
            <li key={item.id}>
              <Link
                href={item.url ?? "/inicio"}
                onClick={() => {
                  if (!item.readAt)
                    void markNotificationRead(item.id).then(() =>
                      queryClient.invalidateQueries({ queryKey: unreadKey }),
                    );
                }}
                className={cn(
                  "flex gap-3 p-4 transition-colors hover:bg-sand/60",
                  !item.readAt && "bg-brand-soft/25",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "mt-1.5 size-2.5 shrink-0 rounded-full",
                    item.readAt ? "bg-transparent" : "bg-brand",
                  )}
                />
                <span className="flex-1">
                  <span className="block font-semibold">{item.title}</span>
                  <span className="block text-[0.92rem] text-ink-soft">{item.body}</span>
                  <span className="mt-1 block text-[0.75rem] text-muted">
                    {timeAgo(item.createdAt)}
                  </span>
                </span>
                {!item.readAt && <span className="sr-only">Não lida</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Preferências por tipo (RN-122) + push neste aparelho. */
export function NotificationSettings({
  prefs,
  vapidPublicKey,
}: {
  prefs: NotificationPrefs;
  vapidPublicKey: string | null;
}): React.JSX.Element {
  const [state, setState] = useState(prefs);
  const [push, setPush] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    void pushEnabled().then(setPush);
  }, []);

  async function save(next: NotificationPrefs): Promise<void> {
    setState(next);
    setSaving(true);
    try {
      await updateNotificationPrefs(next);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Não foi possível salvar.");
      setState(state);
    } finally {
      setSaving(false);
    }
  }

  const optIn = new Set(["novidades_predio"]);
  return (
    <section
      className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-5"
      aria-busy={saving}
    >
      <h2 className="text-lg font-extrabold">Preferências</h2>
      {pushSupported() && vapidPublicKey && push !== null && (
        <div className="flex items-center justify-between gap-4 rounded-xl bg-sand p-3">
          <span className="text-[0.95rem]">
            <span className="block font-semibold">Avisos neste aparelho</span>
            <span className="text-sm text-ink-soft">
              {push ? "Ligados" : "Desligados"}
              {typeof Notification !== "undefined" &&
                Notification.permission === "denied" &&
                ": o navegador está bloqueando. Libere nas configurações do site."}
            </span>
          </span>
          <Button
            size="sm"
            variant={push ? "secondary" : "primary"}
            onClick={async () => {
              if (push) {
                await disablePush();
                setPush(false);
              } else {
                setPush(await enablePush(vapidPublicKey).catch(() => false));
              }
            }}
          >
            {push ? "Desligar" : "Ligar"}
          </Button>
        </div>
      )}
      <ul className="flex flex-col gap-1">
        {notificationTypeSchema.options.map((type) => {
          const checked = optIn.has(type)
            ? state.enabled.includes(type)
            : !state.disabled.includes(type);
          return (
            <li key={type}>
              <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg px-1 py-2">
                <span>{NOTIFICATION_TYPE_LABELS[type]}</span>
                <input
                  type="checkbox"
                  className="size-5 accent-brand"
                  checked={checked}
                  onChange={(event) => {
                    const on = event.target.checked;
                    void save(
                      optIn.has(type)
                        ? {
                            ...state,
                            enabled: on
                              ? [...state.enabled, type]
                              : state.enabled.filter((t) => t !== type),
                          }
                        : {
                            ...state,
                            disabled: on
                              ? state.disabled.filter((t) => t !== type)
                              : [...state.disabled, type],
                          },
                    );
                  }}
                />
              </label>
            </li>
          );
        })}
      </ul>
      <label className="flex cursor-pointer items-center justify-between gap-4 border-t border-line px-1 pt-3">
        <span>
          <span className="block">Horário silencioso</span>
          <span className="text-sm text-muted">
            Avisos não urgentes ficam para depois das 8h (22h–8h)
          </span>
        </span>
        <input
          type="checkbox"
          className="size-5 accent-brand"
          checked={state.quietHours}
          onChange={(event) => void save({ ...state, quietHours: event.target.checked })}
        />
      </label>
    </section>
  );
}
