"use client";

import { BellRing } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { enablePush, pushSupported } from "@/lib/pwa/push";

/** Pedido de permissão contextual (RNF-004): só depois de uma ação, nunca no primeiro acesso. */
export function PushPrompt({
  vapidPublicKey,
}: {
  vapidPublicKey: string;
}): React.JSX.Element | null {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem("anp:push-prompt") === "dismissed";
    } catch {
      // armazenamento indisponível: só mostra
    }
    setVisible(pushSupported() && Notification.permission === "default" && !dismissed);
  }, []);

  if (!visible) return null;

  function dismiss(): void {
    setVisible(false);
    try {
      localStorage.setItem("anp:push-prompt", "dismissed");
    } catch {
      // ignorado
    }
  }

  return (
    <div className="mt-4 flex items-start gap-3 rounded-2xl border border-line bg-white p-4">
      <BellRing className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
      <div className="flex-1">
        <p className="font-semibold">Quer saber quando responderem?</p>
        <p className="text-sm text-ink-soft">Avisamos no celular, mesmo com o app fechado.</p>
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            onClick={async () => {
              const ok = await enablePush(vapidPublicKey).catch(() => false);
              if (ok) toast.success("Avisos ligados");
              dismiss();
            }}
          >
            Ativar avisos
          </Button>
          <Button size="sm" variant="ghost" onClick={dismiss}>
            Agora não
          </Button>
        </div>
      </div>
    </div>
  );
}
