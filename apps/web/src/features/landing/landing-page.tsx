import Image from "next/image";
import Link from "next/link";
import { AiDemo } from "./_components/ai-demo";
import { RadiusDemo } from "./_components/radius-demo";

// Rota de entrada na plataforma (cadastro/login + localizar prédio).
const APP_URL = "/entrar";

const container = "mx-auto w-full max-w-[1120px] px-5";
const btnBase =
  "inline-flex min-h-13 items-center justify-center rounded-full px-7 font-bold transition";
const btnPrimary = `${btnBase} bg-brand text-white shadow-brand hover:-translate-y-px hover:bg-brand-dark`;
const eyebrow =
  "mb-3 inline-block text-sm font-bold uppercase tracking-[0.06em] text-brand-dark";
const sectionTitle =
  "max-w-[40rem] text-[clamp(1.7rem,4vw,2.5rem)] font-extrabold leading-[1.15] tracking-[-0.03em]";
const sectionSub = "mt-3.5 max-w-[38rem] text-[1.08rem] text-ink-soft";

const FEED_PREVIEW = [
  {
    emoji: "🍰",
    title: "Bolo de pote caseiro",
    price: "R$ 10",
    where: "Seu prédio",
    verified: true,
  },
  {
    emoji: "💅",
    title: "Manicure e pedicure em domicílio",
    price: "a partir de R$ 35",
    where: "Ed. Jardins · 400 m",
    verified: true,
  },
  {
    emoji: "📚",
    title: "Aulas de reforço de matemática",
    price: "R$ 60/h",
    where: "Seu prédio",
    verified: false,
  },
  {
    emoji: "🐶",
    title: "Passeio com cachorros",
    price: "a combinar",
    where: "Cond. Bela Vista · 1,2 km",
    verified: true,
  },
];

const BEFORE = [
  "Anúncio perdido em 300 mensagens",
  "“Alguém conhece uma manicure?” toda semana",
  "Só alcança quem está naquele grupo",
  "Seu número exposto para todo mundo",
];

const AFTER = [
  "Anúncios separados por categoria e distância",
  "Busca e alertas: o serviço chega até você",
  "Alcance os prédios vizinhos, se quiser",
  "Contato pelo chat, sem expor seu telefone",
];

const STEPS = [
  {
    title: "Encontre seu prédio",
    text: "Busque pelo nome, CEP ou use “perto de mim”. Não achou? Cadastre o prédio e a gente confere o endereço com IA.",
  },
  {
    title: "Escreva do seu jeito",
    text: "Mande um texto curto e umas fotos. A IA organiza título, descrição, categoria e preço. Você revisa antes de publicar.",
  },
  {
    title: "Escolha até onde vai",
    text: "Só o seu prédio ou os prédios vizinhos num raio de até 5 km. Os interessados chamam você no chat ou no WhatsApp.",
  },
];

const FOR_SELLERS = [
  ["Anúncio pronto em segundos", "sem precisar saber escrever “bonito”."],
  ["Clientes a um elevador de distância", "entrega e atendimento sem deslocamento."],
  ["Alcance sob controle", "você decide se fica no prédio ou vai para o bairro."],
];

const FOR_BUYERS = [
  ["Tudo num lugar só", "nada de rolar o grupo do condomínio atrás daquela indicação."],
  ["Gente de confiança", "anúncios só de moradores, com selo de verificado."],
  ["Filtros que fazem sentido", "categoria, preço e distância do seu prédio."],
];

const TRUST = [
  {
    icon: "🏢",
    title: "Prédios verificados",
    text: "Todo prédio novo passa por validação de endereço com IA e, quando preciso, por revisão da nossa equipe.",
  },
  {
    icon: "🔒",
    title: "Seu apartamento é só seu",
    text: "Número da unidade, telefone e endereço completo nunca aparecem para outros moradores.",
  },
  {
    icon: "🛡️",
    title: "Moderação de verdade",
    text: "Anúncios são revisados automaticamente e qualquer vizinho pode denunciar. Golpista não fica.",
  },
  {
    icon: "👀",
    title: "Só para quem mora",
    text: "Os anúncios não ficam abertos na internet: só quem tem vínculo com um prédio consegue ver.",
  },
];

const FAQ = [
  {
    q: "Preciso morar no prédio para anunciar?",
    a: "Sim. Toda conta é vinculada a um prédio ou condomínio. Você pode ter um prédio principal e até dois adicionais.",
  },
  {
    q: "E se o meu prédio ainda não estiver cadastrado?",
    a: "Você mesmo cadastra informando o endereço. A IA confere se o prédio existe ali; na maioria dos casos a aprovação é imediata.",
  },
  {
    q: "A IA publica o anúncio sozinha?",
    a: "Não. Ela só sugere um rascunho. Você revisa, ajusta o que quiser e só então publica. Ela também não inventa preço ou horário que você não informou.",
  },
  {
    q: "Quem consegue ver meu anúncio?",
    a: "Os moradores do seu prédio e, se você quiser, dos prédios vizinhos dentro do raio escolhido (até 5 km).",
  },
  {
    q: "Meus vizinhos vão ver meu apartamento ou telefone?",
    a: "Não. Eles veem seu nome de exibição e o nome do prédio. O contato acontece pelo chat do app, e o WhatsApp só aparece se você ativar.",
  },
  {
    q: "Preciso baixar algo na loja de aplicativos?",
    a: "Não. O Aqui no Prédio funciona direto no navegador e pode ser instalado na tela inicial do celular, como um app.",
  },
  {
    q: "Posso anunciar que estou procurando um serviço?",
    a: "Pode. Além de serviços e produtos, existe o anúncio do tipo “procura”, como “procuro diarista às sextas”.",
  },
];

export default function Page(): JSX.Element {
  return (
    <>
      <header className="sticky top-0 z-20 border-b border-line bg-cream/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1120px] items-center gap-6 px-5 py-3">
          <Link className="inline-flex items-center" href="/">
            <Image
              alt="Aqui no Prédio"
              height={44}
              priority
              src="/logo-horizontal.png"
              width={112}
            />
          </Link>
          <nav
            aria-label="Seções"
            className="ml-auto hidden gap-6 text-[0.95rem] font-medium text-ink-soft lg:flex"
          >
            <a className="hover:text-brand" href="#como-funciona">
              Como funciona
            </a>
            <a className="hover:text-brand" href="#demo-ia">
              Anúncio com IA
            </a>
            <a className="hover:text-brand" href="#perguntas">
              Perguntas
            </a>
          </nav>
          <Link
            className="ml-auto rounded-full border-[1.5px] border-ink px-[18px] py-2 text-[0.95rem] font-semibold transition hover:bg-ink hover:text-white lg:ml-0"
            href={APP_URL}
          >
            Entrar
          </Link>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="bg-[radial-gradient(circle_at_85%_20%,var(--color-brand-soft),transparent_45%),radial-gradient(circle_at_10%_90%,var(--color-leaf-soft),transparent_40%)] pb-16 pt-12 lg:pb-24 lg:pt-20">
          <div className={`${container} grid items-center gap-12 lg:grid-cols-[1.15fr_0.85fr]`}>
            <div>
              <p className={eyebrow}>Para moradores de prédios e condomínios</p>
              <h1 className="text-[clamp(2.2rem,6vw,3.6rem)] font-extrabold leading-[1.08] tracking-[-0.035em]">
                O que seus vizinhos oferecem, a um{" "}
                <span className="bg-[linear-gradient(transparent_70%,var(--color-brand-soft)_70%)] text-brand">
                  elevador
                </span>{" "}
                de distância.
              </h1>
              <p className="mt-5 max-w-[34rem] text-lg text-ink-soft">
                Encontre e divulgue serviços e produtos no seu prédio e nos
                prédios vizinhos. Escreva do seu jeito e a IA monta o anúncio
                para você.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link className={btnPrimary} href={APP_URL}>
                  Encontrar meu prédio
                </Link>
                <a className={`${btnBase} text-ink hover:text-brand`} href="#demo-ia">
                  Ver o app em ação ↓
                </a>
              </div>
              <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-[0.92rem] font-semibold text-leaf">
                <li>✓ Prédios verificados</li>
                <li>✓ Só moradores veem os anúncios</li>
                <li>✓ Sem baixar nada da loja</li>
              </ul>
            </div>

            {/* Mockup do app */}
            <div
              aria-hidden
              className="w-[min(320px,100%)] rotate-2 justify-self-center rounded-[40px] bg-ink p-3 shadow-lift"
            >
              <div className="relative flex flex-col gap-2.5 rounded-[30px] bg-cream px-3.5 pb-[70px] pt-[18px]">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold">📍 Ed. Solar das Flores</span>
                  <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-[0.72rem] font-semibold text-brand-dark">
                    até 2 km
                  </span>
                </div>
                <div className="flex gap-1.5 overflow-hidden whitespace-nowrap text-[0.72rem]">
                  <span className="rounded-full border border-ink bg-ink px-2.5 py-0.5 text-white">
                    Tudo
                  </span>
                  {["Alimentação", "Beleza", "Aulas"].map((c) => (
                    <span className="rounded-full border border-line bg-white px-2.5 py-0.5" key={c}>
                      {c}
                    </span>
                  ))}
                </div>
                {FEED_PREVIEW.map((item) => (
                  <div
                    className="flex gap-2.5 rounded-[14px] bg-white p-2 shadow-[0_2px_8px_rgba(60,35,20,0.06)]"
                    key={item.title}
                  >
                    <div className="grid size-[58px] flex-none place-items-center rounded-[10px] bg-brand-soft text-[1.8rem]">
                      {item.emoji}
                    </div>
                    <div className="flex min-w-0 flex-col text-[0.78rem] leading-[1.35]">
                      <strong className="truncate text-[0.82rem]">{item.title}</strong>
                      <span className="font-bold text-brand-dark">{item.price}</span>
                      <span className="flex flex-wrap items-center gap-1 text-muted">
                        {item.where}
                        {item.verified ? (
                          <span className="rounded-full bg-leaf-soft px-1.5 text-[0.68rem] font-semibold text-leaf">
                            ✓ verificado
                          </span>
                        ) : null}
                      </span>
                    </div>
                  </div>
                ))}
                <div className="absolute bottom-4 right-3.5 rounded-full bg-brand px-[18px] py-2.5 text-sm font-bold text-white shadow-[0_6px_16px_rgba(214,55,0,0.32)]">
                  ＋ Anunciar
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Problema → solução */}
        <section className="py-18">
          <div className={container}>
            <h2 className={sectionTitle}>Grupo do condomínio não é vitrine.</h2>
            <p className={sectionSub}>
              A indicação boa some entre bom-dias, avisos da portaria e
              discussões sobre a vaga de garagem. Aqui ela fica organizada.
            </p>
            <div className="mt-9 grid gap-4 md:grid-cols-2">
              <div className="rounded-card bg-sand p-7 text-ink-soft">
                <h3 className="mb-3.5 text-lg font-bold text-ink">No grupo de WhatsApp</h3>
                <ul className="grid gap-2.5">
                  {BEFORE.map((t) => (
                    <li className="flex gap-2" key={t}>
                      <span aria-hidden className="font-bold text-[#b0573c]">
                        ✕
                      </span>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-card border-2 border-leaf bg-white p-7 shadow-soft">
                <h3 className="mb-3.5 text-lg font-bold">No Aqui no Prédio</h3>
                <ul className="grid gap-2.5">
                  {AFTER.map((t) => (
                    <li className="flex gap-2" key={t}>
                      <span aria-hidden className="font-bold text-leaf">
                        ✓
                      </span>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Demo IA */}
        <section className="border-y border-line bg-white py-18" id="demo-ia">
          <div className={container}>
            <p className={eyebrow}>Experimente</p>
            <h2 className={sectionTitle}>
              Você escreve como fala. A IA escreve como anúncio.
            </h2>
            <p className={sectionSub}>
              Escolha um exemplo e veja o que acontece quando um morador manda
              uma mensagem rápida com foto.
            </p>
            <AiDemo />
          </div>
        </section>

        {/* Demo raio */}
        <section className="py-18">
          <div className={container}>
            <p className={eyebrow}>Alcance</p>
            <h2 className={sectionTitle}>
              Do seu andar para o bairro inteiro, só se você quiser.
            </h2>
            <p className={sectionSub}>
              Cada anúncio tem um raio. Arraste e veja quais prédios passam a
              enxergar o seu anúncio.
            </p>
            <RadiusDemo />
          </div>
        </section>

        {/* Como funciona */}
        <section className="border-y border-line bg-white py-18" id="como-funciona">
          <div className={container}>
            <p className={eyebrow}>Como funciona</p>
            <h2 className={sectionTitle}>Três passos e você já está no ar.</h2>
            <ol className="mt-9 grid gap-4 md:grid-cols-3">
              {STEPS.map((step, i) => (
                <li className="rounded-card border border-line bg-cream p-7" key={step.title}>
                  <span className="grid size-10 place-items-center rounded-xl bg-brand font-extrabold text-white">
                    {i + 1}
                  </span>
                  <h3 className="mb-2 mt-3.5 text-lg font-bold">{step.title}</h3>
                  <p className="text-ink-soft">{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Benefícios */}
        <section className="py-18">
          <div className={`${container} grid gap-4 md:grid-cols-2`}>
            <BenefitCard
              items={FOR_SELLERS}
              tag="Para quem oferece"
              title="Seu talento, visto por quem mora perto."
              tone="bg-brand-soft"
            />
            <BenefitCard
              items={FOR_BUYERS}
              tag="Para quem procura"
              title="A solução pode estar no 7º andar."
              tone="bg-leaf-soft"
            />
          </div>
        </section>

        {/* Confiança */}
        <section className="border-y border-line bg-white py-18">
          <div className={container}>
            <p className={eyebrow}>Segurança</p>
            <h2 className={sectionTitle}>Feito para vizinhos confiarem.</h2>
            <div className="mt-9 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {TRUST.map((t) => (
                <div className="rounded-card border border-line bg-cream p-6" key={t.title}>
                  <span aria-hidden className="text-[1.6rem]">
                    {t.icon}
                  </span>
                  <h3 className="mb-1.5 mt-2 font-bold">{t.title}</h3>
                  <p className="text-[0.95rem] text-ink-soft">{t.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-18" id="perguntas">
          <div className={`${container} grid items-start gap-7 lg:grid-cols-[0.8fr_1.2fr]`}>
            <h2 className={sectionTitle}>Perguntas frequentes</h2>
            <div className="grid gap-2.5">
              {FAQ.map((item) => (
                <details
                  className="group rounded-[14px] border border-line bg-white"
                  key={item.q}
                >
                  <summary className="relative cursor-pointer list-none py-[18px] pl-5 pr-12 font-semibold [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <span
                      aria-hidden
                      className="absolute right-5 top-1/2 -translate-y-1/2 text-2xl text-brand transition group-open:rotate-45"
                    >
                      +
                    </span>
                  </summary>
                  <p className="px-5 pb-[18px] text-ink-soft">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* CTA final */}
        <section className="bg-linear-135 from-brand to-brand-dark pb-24 pt-20 text-center text-white">
          <div className={container}>
            <h2 className="text-[clamp(1.9rem,5vw,2.8rem)] font-extrabold leading-[1.1] tracking-[-0.03em]">
              Seu prédio já pode estar aqui.
            </h2>
            <p className="mx-auto mb-8 mt-4 max-w-[32rem] text-lg opacity-90">
              Procure pelo nome ou CEP. Se ainda não estiver, você cadastra em
              um minuto e é o primeiro a anunciar.
            </p>
            <Link
              className={`${btnBase} bg-white text-brand-dark hover:-translate-y-px hover:shadow-[0_10px_24px_rgba(0,0,0,0.15)]`}
              href={APP_URL}
            >
              Encontrar meu prédio
            </Link>
            <small className="mt-4 block opacity-80">
              Funciona no navegador e pode ser instalado na tela inicial do celular.
            </small>
          </div>
        </section>
      </main>

      <footer className="border-t border-line pb-28 pt-8 text-sm text-ink-soft lg:pb-8">
        <div className={`${container} flex flex-wrap items-center justify-between gap-x-8 gap-y-4`}>
          <Image
            alt="Aqui no Prédio"
            height={40}
            src="/logo-horizontal.png"
            width={102}
          />
          <nav aria-label="Links legais" className="flex gap-5">
            <Link className="hover:text-brand" href="/termos">
              Termos de uso
            </Link>
            <Link className="hover:text-brand" href="/privacidade">
              Privacidade
            </Link>
          </nav>
          <small>© {new Date().getFullYear()} Aqui no Prédio</small>
        </div>
      </footer>

      {/* CTA fixo no mobile */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-cream/95 px-4 pb-[calc(12px+env(safe-area-inset-bottom,0px))] pt-3 backdrop-blur-md lg:hidden">
        <Link className={`${btnPrimary} w-full`} href={APP_URL}>
          Encontrar meu prédio
        </Link>
      </div>
    </>
  );
}

function BenefitCard({
  tag,
  title,
  items,
  tone,
}: {
  tag: string;
  title: string;
  items: string[][];
  tone: string;
}): JSX.Element {
  return (
    <div className={`rounded-card p-8 ${tone}`}>
      <span className="text-[0.8rem] font-bold uppercase tracking-[0.06em] text-ink-soft">
        {tag}
      </span>
      <h3 className="mb-[18px] mt-2 text-2xl font-extrabold leading-tight tracking-[-0.02em]">
        {title}
      </h3>
      <ul className="grid gap-3 text-ink-soft">
        {items.map(([b, d]) => (
          <li key={b}>
            <strong className="text-ink">{b}</strong> — {d}
          </li>
        ))}
      </ul>
    </div>
  );
}
