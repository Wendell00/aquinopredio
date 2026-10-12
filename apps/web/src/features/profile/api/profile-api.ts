import { api } from "@/lib/api/client";

export async function deleteAccount(): Promise<void> {
  await api.delete("me", { json: { confirm: "EXCLUIR" } });
}
