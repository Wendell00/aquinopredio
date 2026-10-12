"use client";

import type { AdFormOptions, MyAd } from "@repo/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateAd } from "../api/ads-api";
import { adKeys } from "../hooks/use-ads";
import { AdForm, formatPriceInput, toAdInput } from "./ad-form";

export function EditAdForm({
  ad,
  options,
}: {
  ad: MyAd;
  options: AdFormOptions;
}): React.JSX.Element {
  const router = useRouter();
  const queryClient = useQueryClient();
  // O prédio do anúncio pode não estar mais na lista (vínculo pausado), mas o form precisa dele.
  const withCurrent = options.buildings.some((building) => building.id === ad.buildingId)
    ? options
    : {
        ...options,
        buildings: [
          ...options.buildings,
          {
            id: ad.buildingId,
            name: ad.buildingName,
            allowedRadiiKm: [ad.radiusKm],
            buildingVerified: false,
            residentVerified: false,
          },
        ],
      };

  return (
    <AdForm
      options={{
        ...withCurrent,
        buildings: withCurrent.buildings.filter((building) => building.id === ad.buildingId),
        canPublish: true,
      }}
      defaultValues={{
        buildingId: ad.buildingId,
        type: ad.type,
        categoryId: ad.category.id,
        title: ad.title,
        description: ad.description,
        priceMode: ad.priceMode,
        price: formatPriceInput(ad.priceCents),
        radiusKm: ad.radiusKm,
        whatsappEnabled: ad.whatsappEnabled,
        phone: "",
        availability: ad.availability ?? "",
        tagsText: ad.tags.join(", "),
        images: ad.images,
      }}
      submitLabel="Salvar alterações"
      onSubmit={async (values) => {
        const updated = await updateAd(ad.id, toAdInput(values));
        await queryClient.invalidateQueries({ queryKey: adKeys.all });
        toast.success(
          updated.status === "em_moderacao" && ad.status === "ativo"
            ? "Alterações salvas. O anúncio volta a aparecer depois de conferido."
            : "Alterações salvas",
        );
        router.push("/meus-anuncios");
      }}
    />
  );
}
