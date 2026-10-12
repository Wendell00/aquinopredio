import type { Metadata } from "next";
import { ConversationsList } from "@/features/chat/components/conversations-list";

export const metadata: Metadata = { title: "Conversas — Aqui no Prédio" };

export default function ConversationsPage(): React.JSX.Element {
  return (
    <main className="mx-auto flex max-w-[44rem] flex-col gap-6 px-5 py-8">
      <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-[-0.03em]">Conversas</h1>
      <ConversationsList />
    </main>
  );
}
