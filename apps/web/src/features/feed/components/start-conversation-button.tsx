"use client";

import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Abre a conversa sobre o anúncio. O chat chega na próxima etapa. */
export function StartConversationButton({ adId, className }: { adId: string; className?: string }) {
  return (
    <Button className={className} disabled title="Chat em breve" data-ad={adId}>
      <MessageCircle className="size-5" aria-hidden />
      Conversar
    </Button>
  );
}
