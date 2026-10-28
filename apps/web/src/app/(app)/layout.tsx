import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppNav } from "@/components/layout/app-nav";
import { ChatRealtime } from "@/features/chat/components/chat-realtime";
import { getMe } from "@/lib/session/get-me";

export default async function AppLayout({
  children,
}: {
  children: ReactNode;
}): Promise<React.JSX.Element> {
  const me = await getMe();
  if (!me) redirect("/entrar");
  if (me.onboardingStep !== "concluido") redirect("/onboarding");

  return (
    <div className="min-h-dvh pb-24 lg:pb-0 lg:pl-60">
      <AppNav role={me.role} />
      <ChatRealtime />
      {children}
    </div>
  );
}
