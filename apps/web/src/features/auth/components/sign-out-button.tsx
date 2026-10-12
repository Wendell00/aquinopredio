"use client";

import { useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth/auth-client";
import { cn } from "@/lib/cn";

export function SignOutButton({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);

  async function handleClick(): Promise<void> {
    setLoading(true);
    await signOut();
    // Nada do usuário anterior pode ficar no cache de quem usar o aparelho depois.
    queryClient.clear();
    router.replace("/entrar");
    router.refresh();
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      loading={loading}
      onClick={handleClick}
      className={cn(className)}
    >
      {!loading && <LogOut className="size-4" aria-hidden />}
      {compact ? <span className="sr-only">Sair</span> : "Sair"}
    </Button>
  );
}
