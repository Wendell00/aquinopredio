import type { Metadata } from "next";
import { LegalPage } from "@/components/layout/legal-page";

export const metadata: Metadata = { title: "Política de Privacidade — Aqui no Prédio" };

/** Rascunho operacional alinhado à LGPD (docs §6.7). Revisar com assessoria jurídica antes do lançamento. */
export default function PrivacyPage(): React.JSX.Element {
  return (
    <LegalPage title="Política de Privacidade" updated="12 de outubro de 2026">
      <h2>O que os vizinhos veem</h2>
      <p>
        Seu nome de exibição, foto (se tiver), o nome e o bairro do seu prédio, o selo de verificado
        e desde quando você usa o app. Nunca mostramos sua unidade, telefone, e-mail ou o endereço
        completo do prédio para outros prédios.
      </p>
      <h2>Dados que coletamos e por quê</h2>
      <ul>
        <li>Conta (nome, e-mail, senha protegida por hash): para você entrar com segurança.</li>
        <li>
          Prédio e unidade: para mostrar anúncios dos vizinhos. A unidade nunca aparece para os
          vizinhos; só a equipe do app pode vê-la, para resolver denúncias.
        </li>
        <li>Telefone (opcional): só para o botão de WhatsApp dos seus anúncios.</li>
        <li>
          Anúncios, fotos e mensagens: para o app funcionar. Removemos a localização e outros dados
          escondidos das fotos.
        </li>
        <li>
          Sua localização no momento da busca de prédio, se você permitir. Ela não é guardada.
        </li>
      </ul>
      <h2>Com quem compartilhamos</h2>
      <ul>
        <li>
          Provedor de IA (via OpenRouter): textos e fotos enviados para gerar anúncios e para
          moderação, sem uso para treinamento.
        </li>
        <li>OpenStreetMap e ViaCEP: endereço do prédio, para localizar e validar.</li>
        <li>Armazenamento de imagens e envio de e-mails: operadores que seguem esta política.</li>
      </ul>
      <h2>Seus direitos</h2>
      <ul>
        <li>Baixar seus dados em JSON a qualquer momento, no perfil.</li>
        <li>Excluir a conta: anúncios saem do ar na hora e seus dados pessoais são apagados.</li>
        <li>Controlar cada tipo de notificação.</li>
      </ul>
      <h2>Segurança</h2>
      <p>
        Usamos conexão criptografada, sessões que expiram, limites contra tentativas repetidas de
        login e registro das ações de moderação.
      </p>
    </LegalPage>
  );
}
