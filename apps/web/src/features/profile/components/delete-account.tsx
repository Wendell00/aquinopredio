"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api/client";
import { signOut } from "@/lib/auth/auth-client";
import { deleteAccount } from "../api/profile-api";

export function DeleteAccount(): React.JSX.Element {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<{ message: string; relogin: boolean } | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      await deleteAccount();
      queryClient.clear();
      router.replace("/?conta=excluida");
    } catch (cause) {
      const relogin = cause instanceof ApiError && cause.code === "FRESH_LOGIN_REQUIRED";
      setError({
        message: cause instanceof ApiError ? cause.message : "Não foi possível excluir a conta.",
        relogin,
      });
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="list-disc space-y-1 pl-5 text-ink-soft">
        <li>Seus anúncios saem do ar na hora.</li>
        <li>Nas conversas, suas mensagens passam a aparecer como “Usuário removido”.</li>
        <li>
          Nome, e-mail, telefone, fotos e prédios são apagados. Ficam só registros de moderação
          exigidos por segurança.
        </li>
        <li>
          Não dá para desfazer. Se quiser,{" "}
          <a href="/api/me/export" className="font-semibold underline">
            baixe seus dados
          </a>{" "}
          antes.
        </li>
      </ul>
      {error && (
        <Alert tone="error">
          {error.message}
          {error.relogin && (
            <>
              {" "}
              <button
                type="button"
                className="font-semibold underline"
                onClick={async () => {
                  await signOut();
                  router.replace("/entrar?next=/perfil/excluir");
                }}
              >
                Entrar de novo
              </button>
            </>
          )}
        </Alert>
      )}
      <label htmlFor="confirm-delete" className="text-sm font-semibold">
        Para confirmar, digite EXCLUIR
      </label>
      <Input
        id="confirm-delete"
        value={confirm}
        onChange={(event) => setConfirm(event.target.value)}
        autoComplete="off"
        className="max-w-60"
      />
      <div className="flex gap-2">
        <Button
          variant="danger"
          disabled={confirm !== "EXCLUIR"}
          loading={loading}
          onClick={submit}
        >
          Excluir minha conta
        </Button>
        <Link
          href="/perfil"
          className="inline-flex min-h-12 items-center px-4 font-semibold text-ink-soft"
        >
          Cancelar
        </Link>
      </div>
    </div>
  );
}
