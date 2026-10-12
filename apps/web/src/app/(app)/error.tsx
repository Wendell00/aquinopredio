"use client";

import { ServiceError } from "@/components/layout/service-error";

export default function RootError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ServiceError reset={reset} />;
}
