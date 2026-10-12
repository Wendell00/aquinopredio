"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getBlockedUsers, unblockUser } from "@/features/feed/api/feed-api";

export function BlockedUsers(): React.JSX.Element {
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery({ queryKey: ["blocks"], queryFn: getBlockedUsers });
  const unblock = useMutation({
    mutationFn: unblockUser,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["blocks"] });
      void queryClient.invalidateQueries({ queryKey: ["feed"] });
      toast.success("Desbloqueado");
    },
  });
  if (isPending) return <div className="h-16 animate-pulse rounded-2xl bg-sand" />;
  if (!data?.length) return <p className="text-ink-soft">Você não bloqueou ninguém.</p>;
  return (
    <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-white">
      {data.map((user) => (
        <li key={user.id} className="flex items-center justify-between gap-3 p-4">
          <span className="font-semibold">{user.name}</span>
          <Button
            variant="secondary"
            size="sm"
            loading={unblock.isPending && unblock.variables === user.id}
            onClick={() => unblock.mutate(user.id)}
          >
            Desbloquear
          </Button>
        </li>
      ))}
    </ul>
  );
}
