import { z } from "zod";
import { adImageSchema } from "./ads";
import { notificationPrefsSchema, type notificationTypeSchema } from "./users";

export const conversationStatusSchema = z.enum(["aberta", "bloqueada"]);

export const messageSchema = z.object({
  id: z.uuid(),
  mine: z.boolean(),
  /** null quando a conta de quem enviou foi excluída (RN-008). */
  senderName: z.string().nullable(),
  body: z.string().nullable(),
  image: adImageSchema.nullable(),
  /** Mensagem com link externo: exibir aviso de segurança (RN-085). */
  hasLink: z.boolean(),
  flagged: z.boolean(),
  readAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type Message = z.infer<typeof messageSchema>;

export const conversationSummarySchema = z.object({
  id: z.uuid(),
  status: conversationStatusSchema,
  role: z.enum(["comprador", "vendedor"]),
  ad: z.object({
    id: z.uuid(),
    title: z.string(),
    thumbUrl: z.url().nullable(),
    active: z.boolean(),
  }),
  other: z.object({ id: z.uuid().nullable(), name: z.string(), image: z.string().nullable() }),
  lastMessage: z
    .object({
      body: z.string().nullable(),
      mine: z.boolean(),
      createdAt: z.iso.datetime(),
      hasImage: z.boolean(),
    })
    .nullable(),
  unread: z.number().int(),
});
export type ConversationSummary = z.infer<typeof conversationSummarySchema>;

export const conversationDetailSchema = conversationSummarySchema.extend({
  messages: z.array(messageSchema),
  hasOlder: z.boolean(),
});
export type ConversationDetail = z.infer<typeof conversationDetailSchema>;

export const sendMessageInputSchema = z
  .object({
    body: z.string().trim().max(2000).optional(),
    imageId: z.uuid().optional(),
  })
  .refine((input) => Boolean(input.body) || Boolean(input.imageId), {
    message: "Escreva uma mensagem",
  });
export type SendMessageInput = z.input<typeof sendMessageInputSchema>;

export const messagesQuerySchema = z.object({
  after: z.iso.datetime().optional(),
  before: z.iso.datetime().optional(),
});

export const notificationSchema = z.object({
  id: z.uuid(),
  type: z.string(),
  title: z.string(),
  body: z.string(),
  url: z.string().nullable(),
  readAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type AppNotification = z.infer<typeof notificationSchema>;

export const unreadCountsSchema = z.object({
  conversations: z.number().int(),
  notifications: z.number().int(),
});
export type UnreadCounts = z.infer<typeof unreadCountsSchema>;

/** Serviços de push dos navegadores. Outros hosts são recusados (evita SSRF a partir da API). */
export const PUSH_SERVICE_HOSTS =
  /^(fcm\.googleapis\.com|([a-z0-9-]+\.)*push\.services\.mozilla\.com|([a-z0-9-]+\.)*notify\.windows\.com|web\.push\.apple\.com)$/;

export const pushSubscriptionInputSchema = z.object({
  endpoint: z.url().refine((url) => {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && !parsed.port && PUSH_SERVICE_HOSTS.test(parsed.hostname);
  }, "Serviço de push não suportado"),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(10).max(100) }),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionInputSchema>;

export const updateNotificationPrefsSchema = notificationPrefsSchema;

export const NOTIFICATION_TYPE_LABELS: Record<z.infer<typeof notificationTypeSchema>, string> = {
  nova_mensagem: "Novas mensagens",
  anuncio_aprovado: "Anúncio aprovado",
  anuncio_removido: "Anúncio removido pela moderação",
  anuncio_expirando: "Anúncio perto de expirar",
  vinculo_atualizado: "Pedido para entrar no prédio",
  predio_atualizado: "Verificação do prédio",
  novidades_predio: "Resumo de novidades do prédio",
  favorito_alterado: "Mudanças em favoritos",
  denuncia_resolvida: "Resultado de denúncias",
  plano_atualizado: "Mudanças no seu plano",
  nova_avaliacao: "Novas avaliações",
};
