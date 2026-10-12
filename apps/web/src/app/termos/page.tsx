import type { Metadata } from "next";
import { LegalPage } from "@/components/layout/legal-page";

export const metadata: Metadata = { title: "Termos de Uso — Aqui no Prédio" };

/** Rascunho operacional dos termos. Revisar com assessoria jurídica antes do lançamento. */
export default function TermsPage(): React.JSX.Element {
  return (
    <LegalPage title="Termos de Uso" updated="12 de outubro de 2026">
      <p>
        O Aqui no Prédio aproxima vizinhos que oferecem e procuram serviços e produtos. Ao criar uma
        conta, você concorda com estas regras.
      </p>
      <h2>Quem pode usar</h2>
      <ul>
        <li>Pessoas com 18 anos ou mais que moram no prédio ou condomínio informado.</li>
        <li>
          Cada pessoa tem uma conta. Telefone e e-mail não podem ser usados em mais de uma conta.
        </li>
      </ul>
      <h2>Anúncios</h2>
      <ul>
        <li>Você é responsável pelo que anuncia e pela negociação com os vizinhos.</li>
        <li>
          É proibido anunciar itens ilegais, armas, drogas, medicamentos controlados, conteúdo
          adulto, animais silvestres, apostas, pirâmides financeiras, falsificações ou dados de
          outras pessoas.
        </li>
        <li>Todo anúncio passa por moderação automática e pode ser revisado pela equipe.</li>
        <li>Anúncios ficam ativos por 30 dias e podem ser renovados de graça.</li>
      </ul>
      <h2>Uso da inteligência artificial</h2>
      <p>
        A IA sugere textos a partir do que você escreve e das fotos que envia. Você sempre revisa
        antes de publicar e continua responsável pelo conteúdo.
      </p>
      <h2>Convivência e segurança</h2>
      <ul>
        <li>Trate os vizinhos com respeito. Denuncie golpes, spam e conteúdo impróprio.</li>
        <li>
          Infrações levam a aviso, suspensão de publicação por 7 dias e, na terceira, banimento.
          Golpes e conteúdo ilegal levam a banimento imediato. Você pode contestar uma vez cada
          decisão.
        </li>
      </ul>
      <h2>Encerramento</h2>
      <p>Você pode excluir sua conta a qualquer momento no seu perfil.</p>
    </LegalPage>
  );
}
