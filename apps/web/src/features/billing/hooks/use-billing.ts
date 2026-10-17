import type { BillingStatus } from "@repo/shared";
import { queryOptions, useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/api/client";
import { getBillingStatus, openPortal, startCheckout } from "../api/billing-api";

export const billingQueryOptions = queryOptions({
  queryKey: ["billing"],
  queryFn: getBillingStatus,
});

export function useBilling(initialData?: BillingStatus) {
  return useQuery({ ...billingQueryOptions, initialData });
}

/** Leva ao Stripe (checkout ou portal). A página sai do app, então não há estado a atualizar. */
export function useStripeRedirect(target: "checkout" | "portal") {
  return useMutation({
    mutationFn: target === "checkout" ? startCheckout : openPortal,
    onSuccess: ({ url }) => window.location.assign(url),
    onError: (error) =>
      toast.error(
        error instanceof ApiError ? error.message : "Não foi possível abrir o pagamento agora.",
      ),
  });
}
