"use client";

import type { AdDetail } from "@repo/shared";
import { ImageOff } from "lucide-react";
import Image from "next/image";
import { useRef, useState } from "react";
import { cn } from "@/lib/cn";

/** Galeria com rolagem por toque (scroll-snap), sem biblioteca de carrossel. */
export function AdGallery({
  images,
  title,
}: {
  images: AdDetail["images"];
  title: string;
}): React.JSX.Element {
  const [current, setCurrent] = useState(0);
  const track = useRef<HTMLDivElement>(null);

  if (!images.length) {
    return (
      <div className="grid aspect-[4/3] place-items-center rounded-2xl bg-sand text-muted">
        <ImageOff className="size-8" aria-hidden />
      </div>
    );
  }

  return (
    <section
      className="flex flex-col gap-2"
      aria-roledescription="carrossel"
      aria-label={`Fotos de ${title}`}
    >
      <div
        ref={track}
        onScroll={(event) => {
          const element = event.currentTarget;
          setCurrent(Math.round(element.scrollLeft / element.clientWidth));
        }}
        className="flex aspect-[4/3] snap-x snap-mandatory overflow-x-auto rounded-2xl bg-sand [scrollbar-width:none]"
      >
        {images.map((image, index) => (
          <figure key={image.id} className="relative m-0 w-full shrink-0 snap-center">
            <figcaption className="sr-only">
              Foto {index + 1} de {images.length}
            </figcaption>
            <Image
              src={image.url}
              alt={index === 0 ? title : ""}
              fill
              sizes="(min-width: 768px) 640px, 100vw"
              className="object-contain"
              priority={index === 0}
            />
          </figure>
        ))}
      </div>
      {images.length > 1 && (
        <div className="flex justify-center gap-1.5">
          {images.map((image, index) => (
            <button
              key={image.id}
              type="button"
              onClick={() =>
                track.current?.scrollTo({
                  left: index * track.current.clientWidth,
                  behavior: "smooth",
                })
              }
              aria-label={`Ver foto ${index + 1}`}
              aria-current={current === index}
              className={cn(
                "h-2 rounded-full transition-all",
                current === index ? "w-5 bg-ink" : "w-2 bg-ink/25",
              )}
            />
          ))}
        </div>
      )}
    </section>
  );
}
