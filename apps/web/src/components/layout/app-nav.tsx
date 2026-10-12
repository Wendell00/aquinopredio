"use client";

import type { UserRole } from "@repo/shared";
import {
  Heart,
  House,
  type LucideIcon,
  MessageCircle,
  Plus,
  Shield,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/cn";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  primary?: boolean;
}

const ITEMS: NavItem[] = [
  { href: "/inicio", label: "Início", icon: House },
  { href: "/favoritos", label: "Favoritos", icon: Heart },
  { href: "/anunciar", label: "Anunciar", icon: Plus, primary: true },
  { href: "/conversas", label: "Conversas", icon: MessageCircle },
  { href: "/perfil", label: "Perfil", icon: UserRound },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Barra inferior no celular; trilho lateral no desktop. */
export function AppNav({
  role,
  unread = 0,
}: {
  role: UserRole;
  unread?: number;
}): React.JSX.Element {
  const pathname = usePathname();
  const items =
    role === "platform_admin"
      ? [...ITEMS, { href: "/admin", label: "Admin", icon: Shield }]
      : ITEMS;

  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:inset-y-0 lg:left-0 lg:right-auto lg:w-60 lg:border-r lg:border-t-0 lg:bg-cream lg:pb-0"
    >
      <div className="hidden px-6 pt-6 lg:block">
        <Logo href="/inicio" />
      </div>
      <ul className="mx-auto flex max-w-[34rem] items-stretch justify-around lg:mt-10 lg:flex-col lg:justify-start lg:gap-1 lg:px-3">
        {items.map(({ href, label, icon: Icon, primary }) => {
          const active = isActive(pathname, href);
          const badge = href === "/conversas" && unread > 0;
          return (
            <li key={href} className="flex-1 lg:flex-none">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex flex-col items-center gap-0.5 px-1 py-2 text-[0.72rem] font-semibold lg:flex-row lg:gap-3 lg:rounded-xl lg:px-4 lg:py-3 lg:text-[0.95rem]",
                  active ? "text-brand" : "text-ink-soft hover:text-ink",
                  active && "lg:bg-brand-soft",
                  !active && "lg:hover:bg-sand",
                )}
              >
                <span
                  className={cn(
                    "relative grid place-items-center",
                    primary && "size-10 rounded-full bg-brand text-white shadow-brand lg:size-8",
                  )}
                >
                  <Icon
                    className={cn(primary ? "size-5" : "size-6 lg:size-5")}
                    aria-hidden
                    strokeWidth={2.2}
                  />
                  {badge && (
                    <span className="absolute -right-2 -top-1 grid min-w-4.5 place-items-center rounded-full bg-brand px-1 text-[0.65rem] font-bold text-white">
                      {unread > 9 ? "9+" : unread}
                      <span className="sr-only"> conversas não lidas</span>
                    </span>
                  )}
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
