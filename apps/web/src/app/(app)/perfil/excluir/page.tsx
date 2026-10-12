import type { Metadata } from "next";
import { DeleteAccount } from "@/features/profile/components/delete-account";

export const metadata: Metadata = { title: "Excluir conta — Aqui no Prédio" };

export default function DeletePage(): React.JSX.Element {
  return (
    <main className="mx-auto flex max-w-[40rem] flex-col gap-6 px-5 py-8">
      <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-[-0.03em]">
        Excluir conta
      </h1>
      <DeleteAccount />
    </main>
  );
}
