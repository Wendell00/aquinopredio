import { randomBytes } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import type { EntityManager } from "typeorm";
import dataSource from "../database/data-source";

/**
 * Dados de demonstração: 3 prédios vizinhos em Pinheiros (SP), 5 contas, anúncios, uma conversa,
 * indicações e uma avaliação. Idempotente: se as contas de demonstração já existem, não faz nada.
 *
 * Uso: pnpm --filter api build && pnpm --filter api db:seed
 * A senha das contas vem de SEED_PASSWORD ou é gerada e mostrada no fim (nunca fixa no código).
 */

const DOMAIN = "aquinopredio.test";

/** 1° de latitude ≈ 111 km. */
const north = (lat: number, meters: number) => lat + meters / 111_000;
const BASE = { lat: -23.5614, lng: -46.6825 };

const BUILDINGS = [
  {
    key: "jacaranda",
    name: "Edifício Jacarandá",
    cep: "05422000",
    street: "Rua dos Pinheiros",
    number: "870",
    district: "Pinheiros",
    ...BASE,
  },
  {
    key: "ipes",
    name: "Condomínio Solar dos Ipês",
    cep: "05422001",
    street: "Rua Cardeal Arcoverde",
    number: "1200",
    district: "Pinheiros",
    lat: north(BASE.lat, 700),
    lng: BASE.lng,
  },
  {
    key: "aurora",
    name: "Residencial Aurora",
    cep: "05407002",
    street: "Rua Teodoro Sampaio",
    number: "350",
    district: "Pinheiros",
    lat: north(BASE.lat, 3500),
    lng: BASE.lng,
  },
] as const;
type BuildingKey = (typeof BUILDINGS)[number]["key"];

const USERS = [
  {
    key: "ana",
    name: "Ana Ribeiro",
    username: "ana.ribeiro",
    building: "jacaranda",
    unit: "Apto 42",
    plan: "pro",
    role: "user",
    phone: "+5511900000001",
  },
  {
    key: "bruno",
    name: "Bruno Lima",
    username: "bruno_lima",
    building: "jacaranda",
    unit: "Apto 81",
    plan: "free",
    role: "user",
    phone: null,
  },
  {
    key: "carla",
    name: "Carla Mendes",
    username: "carlamendes",
    building: "ipes",
    unit: "Bloco B 12",
    plan: "free",
    role: "user",
    phone: "+5511900000003",
  },
  {
    key: "diego",
    name: "Diego Souza",
    username: "diego.souza",
    building: "aurora",
    unit: "Apto 105",
    plan: "free",
    role: "user",
    phone: null,
  },
  {
    key: "admin",
    name: "Equipe Aqui no Prédio",
    username: "equipe_plataforma",
    building: "jacaranda",
    unit: "Apto 11",
    plan: "free",
    role: "platform_admin",
    phone: null,
  },
] as const;
type UserKey = (typeof USERS)[number]["key"];

interface AdSeed {
  key: string;
  owner: UserKey;
  type: "servico" | "produto" | "procura";
  category: string;
  title: string;
  description: string;
  priceMode: "fixo" | "a_partir_de" | "a_combinar" | "gratuito";
  priceCents: number | null;
  radiusKm: number;
  availability: string | null;
  tags: string[];
  whatsapp?: boolean;
  featured?: boolean;
}

const ADS: AdSeed[] = [
  {
    key: "eletrica",
    owner: "ana",
    type: "servico",
    category: "reparos-manutencao",
    title: "Eletricista residencial: tomadas, chuveiros e quadros",
    description:
      "Troco tomadas e interruptores, instalo chuveiros e luminárias e reviso quadros de luz. Atendo com material ou só mão de obra, com orçamento sem compromisso.",
    priceMode: "a_partir_de",
    priceCents: 8000,
    radiusKm: 10,
    availability: "horario_comercial",
    tags: ["eletricista", "chuveiro", "tomada"],
    whatsapp: true,
    featured: true,
  },
  {
    key: "montagem",
    owner: "ana",
    type: "servico",
    category: "reparos-manutencao",
    title: "Montagem de móveis e instalação de prateleiras",
    description:
      "Monto guarda-roupas, camas, estantes e instalo prateleiras e suportes de TV. Levo as ferramentas e deixo tudo limpo.",
    priceMode: "a_combinar",
    priceCents: null,
    radiusKm: 5,
    availability: "fins_de_semana",
    tags: ["montagem", "moveis"],
  },
  {
    key: "bolo",
    owner: "bruno",
    type: "produto",
    category: "alimentacao",
    title: "Bolo de pote caseiro (chocolate e ninho)",
    description:
      "Bolos de pote feitos em casa toda sexta, sabores chocolate com brigadeiro e ninho com morango. Entrego na portaria do prédio.",
    priceMode: "fixo",
    priceCents: 1200,
    radiusKm: 1,
    availability: "fins_de_semana",
    tags: ["bolo", "doce"],
  },
  {
    key: "ingles",
    owner: "carla",
    type: "servico",
    category: "aulas-educacao",
    title: "Aulas de inglês para crianças e adultos",
    description:
      "Professora com 8 anos de experiência. Aulas de conversação e reforço escolar, presenciais no seu apartamento ou on-line.",
    priceMode: "fixo",
    priceCents: 9000,
    radiusKm: 1,
    availability: "noites",
    tags: ["ingles", "aulas", "reforco"],
    whatsapp: true,
  },
  {
    key: "passeio",
    owner: "carla",
    type: "servico",
    category: "pets",
    title: "Passeio com cachorros no fim da tarde",
    description:
      "Passeios de 1 hora com cães de pequeno e médio porte, em grupos de até 3. Mando fotos durante o passeio.",
    priceMode: "fixo",
    priceCents: 3500,
    radiusKm: 0.5,
    availability: "dias_uteis",
    tags: ["pet", "cachorro", "passeio"],
  },
  {
    key: "bicicleta",
    owner: "diego",
    type: "produto",
    category: "outros",
    title: "Bicicleta aro 29 seminova",
    description:
      "Bicicleta aro 29, 21 marchas, freio a disco, pouquíssimo uso. Acompanha capacete e cadeado.",
    priceMode: "fixo",
    priceCents: 95000,
    radiusKm: 1,
    availability: "a_combinar",
    tags: ["bicicleta", "esporte"],
  },
  {
    key: "diarista",
    owner: "bruno",
    type: "procura",
    category: "limpeza-organizacao",
    title: "Procuro diarista para 1 vez por semana",
    description:
      "Procuro diarista de confiança para limpeza de apartamento de 2 quartos, uma vez por semana, de preferência às quartas.",
    priceMode: "a_combinar",
    priceCents: null,
    radiusKm: 1,
    availability: null,
    tags: ["diarista", "limpeza"],
  },
  {
    key: "livros",
    owner: "diego",
    type: "produto",
    category: "outros",
    title: "Doação de livros infantis",
    description:
      "Tenho uma caixa com uns 20 livros infantis em bom estado para doar. Quem tiver interesse, é só retirar.",
    priceMode: "gratuito",
    priceCents: null,
    radiusKm: 0,
    availability: "a_combinar",
    tags: ["livros", "doacao"],
  },
];

async function insertUser(
  manager: EntityManager,
  user: (typeof USERS)[number],
  passwordHash: string,
): Promise<string> {
  const [{ id }] = await manager.query(
    `INSERT INTO users (name, email, email_verified, username, phone, status, role, plan, terms_accepted_at)
     VALUES ($1, $2, true, $3, $4, 'ativo', $5, $6, now()) RETURNING id`,
    [user.name, `${user.key}@${DOMAIN}`, user.username, user.phone, user.role, user.plan],
  );
  // Mesmo formato que o Better Auth grava no cadastro por e-mail e senha.
  await manager.query(
    `INSERT INTO accounts (account_id, provider_id, user_id, password, created_at, updated_at)
     VALUES ($1, 'credential', $2, $3, now(), now())`,
    [id, id, passwordHash],
  );
  return id;
}

type Ids<K extends string> = (key: K) => string;

function lookup<K extends string>(map: Map<K, string>, label: string): Ids<K> {
  return (key) => {
    const found = map.get(key);
    if (!found) throw new Error(`${label} ${key} não encontrado`);
    return found;
  };
}

async function seedUsers(manager: EntityManager, passwordHash: string): Promise<Ids<UserKey>> {
  const ids = new Map<UserKey, string>();
  for (const user of USERS) ids.set(user.key, await insertUser(manager, user, passwordHash));
  return lookup(ids, "usuário");
}

async function seedBuildings(
  manager: EntityManager,
  user: Ids<UserKey>,
): Promise<Ids<BuildingKey>> {
  const ids = new Map<BuildingKey, string>();
  for (const building of BUILDINGS) {
    const creator = USERS.find((item) => item.building === building.key)?.key ?? "admin";
    const [{ id }] = await manager.query(
      `INSERT INTO buildings (name, type, cep, street, number, district, city, state, location, status, created_by)
       VALUES ($1, 'edificio', $2, $3, $4, $5, 'São Paulo', 'SP',
               ST_SetSRID(ST_MakePoint($6, $7), 4326)::geography, 'verificado', $8)
       RETURNING id`,
      [
        building.name,
        building.cep,
        building.street,
        building.number,
        building.district,
        building.lng,
        building.lat,
        user(creator),
      ],
    );
    ids.set(building.key, id);
  }
  const building = lookup(ids, "prédio");
  for (const item of USERS) {
    await manager.query(
      `INSERT INTO building_memberships (user_id, building_id, unit, status, decided_at, verified_at)
       VALUES ($1, $2, $3, 'ativo', now(), CASE WHEN $4::boolean THEN now() END)`,
      [
        user(item.key),
        building(item.building),
        item.unit,
        item.key === "ana" || item.key === "carla",
      ],
    );
    await manager.query(`UPDATE users SET primary_building_id = $2 WHERE id = $1`, [
      user(item.key),
      building(item.building),
    ]);
  }
  return building;
}

async function seedAds(
  manager: EntityManager,
  user: Ids<UserKey>,
  building: Ids<BuildingKey>,
  categories: Map<string, string>,
): Promise<Ids<string>> {
  const ids = new Map<string, string>();
  for (const [index, ad] of ADS.entries()) {
    const owner = USERS.find((item) => item.key === ad.owner);
    const categoryId = categories.get(ad.category) ?? categories.get("outros");
    if (!owner || !categoryId) throw new Error(`anúncio ${ad.key}`);
    const [{ id }] = await manager.query(
      `INSERT INTO ads (user_id, building_id, type, category_id, title, description, price_mode, price_cents,
                        radius_m, location, whatsapp_enabled, availability, tags, status,
                        published_at, expires_at, featured_at)
       SELECT $1, b.id, $2, $3, $4, $5, $6, $7, $8, b.location, $9, $10, $11, 'ativo',
              now() - make_interval(hours => $12), now() + interval '30 days',
              CASE WHEN $13::boolean THEN now() END
       FROM buildings b WHERE b.id = $14
       RETURNING id`,
      [
        user(ad.owner),
        ad.type,
        categoryId,
        ad.title,
        ad.description,
        ad.priceMode,
        ad.priceCents,
        Math.round(ad.radiusKm * 1000),
        ad.whatsapp ?? false,
        ad.availability,
        ad.tags,
        index * 5,
        ad.featured ?? false,
        building(owner.building),
      ],
    );
    ids.set(ad.key, id);
  }
  return lookup(ids, "anúncio");
}

/** Bruno conversou com a Ana sobre o eletricista, ela respondeu e ele avaliou. */
async function seedInteractions(
  manager: EntityManager,
  user: Ids<UserKey>,
  ad: Ids<string>,
): Promise<void> {
  const [{ id: conversationId }] = await manager.query(
    `INSERT INTO conversations (ad_id, buyer_id, seller_id, last_message_at)
     VALUES ($1, $2, $3, now()) RETURNING id`,
    [ad("eletrica"), user("bruno"), user("ana")],
  );
  const messages: [UserKey, string, number][] = [
    ["bruno", "Oi, Ana! Meu chuveiro parou de esquentar. Você consegue olhar essa semana?", 50],
    ["ana", "Oi, Bruno! Consigo sim, passo aí amanhã às 19h.", 45],
    ["bruno", "Perfeito, obrigado!", 40],
  ];
  for (const [sender, body, minutesAgo] of messages) {
    await manager.query(
      `INSERT INTO messages (conversation_id, sender_id, body, created_at, read_at)
       VALUES ($1, $2, $3, now() - make_interval(mins => $4), now())`,
      [conversationId, user(sender), body, minutesAgo],
    );
  }
  await manager.query(
    `INSERT INTO user_reviews (reviewer_id, reviewed_id, ad_id, rating, comment)
     VALUES ($1, $2, $3, 5, 'Resolveu o chuveiro em meia hora e deixou tudo limpo. Recomendo!')`,
    [user("bruno"), user("ana"), ad("eletrica")],
  );
  const recommendations: [string, UserKey][] = [
    ["eletrica", "bruno"],
    ["eletrica", "carla"],
    ["bolo", "ana"],
    ["ingles", "ana"],
  ];
  for (const [adKey, userKey] of recommendations) {
    await manager.query(`INSERT INTO ad_recommendations (ad_id, user_id) VALUES ($1, $2)`, [
      ad(adKey),
      user(userKey),
    ]);
  }
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    console.error("O seed cria contas de demonstração e não roda com NODE_ENV=production.");
    process.exitCode = 1;
    return;
  }
  await dataSource.initialize();
  try {
    const [existing] = await dataSource.query(`SELECT 1 FROM users WHERE email = $1`, [
      `ana@${DOMAIN}`,
    ]);
    if (existing) {
      console.warn("Seed já aplicado (contas @aquinopredio.test existem). Nada foi alterado.");
      return;
    }

    const password = process.env.SEED_PASSWORD || randomBytes(9).toString("base64url");
    const passwordHash = await hashPassword(password);
    const categories = new Map<string, string>(
      (await dataSource.query(`SELECT slug, id FROM categories`)).map(
        (row: { slug: string; id: string }) => [row.slug, row.id],
      ),
    );

    await dataSource.transaction(async (manager) => {
      const users = await seedUsers(manager, passwordHash);
      const buildings = await seedBuildings(manager, users);
      const ads = await seedAds(manager, users, buildings, categories);
      await seedInteractions(manager, users, ads);
    });

    console.warn("Seed aplicado: 3 prédios, 5 contas, 8 anúncios, 1 conversa, 1 avaliação.");
    console.warn(`Contas (senha: ${password}):`);
    for (const user of USERS) {
      const extra = user.role === "platform_admin" ? " — admin da plataforma" : ` — ${user.plan}`;
      console.warn(`  ${user.key}@${DOMAIN}${extra}`);
    }
  } finally {
    await dataSource.destroy();
  }
}

void main();
