"use client";

import { MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { startConversation } from "@/features/chat/api/chat-api";
import { ApiError } from "@/lib/api/client";

/** Abre (ou retoma) a conversa com o anunciante sobre este anúncio (RN-080). */
export function StartConversationButton({ adId, className }: { adId: string; className?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  return (
    <Button
      className={className}
      loading={loading}
      onClick={async () => {
        setLoading(true);
        try {
          const conversation = await startConversation(adId);
          router.push(`/conversas/${conversation.id}`);
        } catch (error) {
          toast.error(
            error instanceof ApiError ? error.message : "Não foi possível abrir a conversa.",
          );
          setLoading(false);
        }
      }}
    >
      {!loading && <MessageCircle className="size-5" aria-hidden />}
      Conversar
    </Button>
  );
}
