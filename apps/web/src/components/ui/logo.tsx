import Image from "next/image";
import Link from "next/link";

export function Logo({ href = "/" }: { href?: string }): React.JSX.Element {
  return (
    <Link href={href} className="inline-flex items-center" aria-label="Aqui no Prédio — início">
      <Image
        src="/logo-horizontal.png"
        alt=""
        width={112}
        height={44}
        priority
        style={{ width: "auto", height: "auto" }}
      />
    </Link>
  );
}
