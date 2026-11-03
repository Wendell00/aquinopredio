import type { INestApplication } from "@nestjs/common";
import { AdModerationService } from "../../src/ads/moderation/ad-moderation.service";
import { observableList, withTimeout } from "./sync";

type ModerateResult = Awaited<ReturnType<AdModerationService["moderate"]>>;
/** Embrulho: guardar a promessa crua numa lista observável faria `await` desembrulhá-la. */
interface Run {
  done: Promise<ModerateResult>;
}

/**
 * Captura as moderações disparadas em segundo plano (fire-and-forget) para os testes aguardarem
 * a promessa real de cada uma, em vez de disparar outra análise ou esperar por tempo.
 */
export function trackModeration(app: INestApplication) {
  const service = app.get(AdModerationService);
  const original = service.moderate.bind(service);
  const byAd = new Map<string, ReturnType<typeof observableList<Run>>>();
  const of = (adId: string) => {
    let found = byAd.get(adId);
    if (!found) {
      found = observableList<Run>();
      byAd.set(adId, found);
    }
    return found;
  };
  const spy = jest.spyOn(service, "moderate").mockImplementation((adId: string) => {
    const done = original(adId);
    of(adId).push({ done });
    return done;
  });

  const list = (adId: string) => of(adId).items.map((run) => run.done);

  return {
    /** Quantas moderações já começaram para o anúncio. */
    count: (adId: string) => list(adId).length,
    /** A n-ésima moderação do anúncio (0 = primeira), esperando ela começar se preciso. */
    async nth(adId: string, index: number, label = `moderação #${index}`) {
      const run = await of(adId).at(index, `${label} começar`);
      return withTimeout(run.done, `${label} terminar`);
    },
    /** Espera todas as moderações do anúncio (inclusive as iniciadas enquanto espera). */
    async settled(adId: string): Promise<ModerateResult | undefined> {
      let seen = -1;
      let last: PromiseSettledResult<ModerateResult> | undefined;
      while (seen !== list(adId).length) {
        seen = list(adId).length;
        const results = await withTimeout(
          Promise.allSettled(list(adId)),
          `moderações do anúncio ${adId}`,
        );
        last = results.at(-1);
      }
      if (last?.status === "rejected") throw last.reason;
      return last?.value;
    },
    async settleAll(): Promise<void> {
      await withTimeout(
        Promise.allSettled(
          [...byAd.values()].flatMap((entry) => entry.items.map((run) => run.done)),
        ),
        "todas as moderações pendentes",
      );
    },
    restore: () => spy.mockRestore(),
  };
}

export type ModerationTracker = ReturnType<typeof trackModeration>;
