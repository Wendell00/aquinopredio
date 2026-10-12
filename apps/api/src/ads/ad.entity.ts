import type { AdStatus, AdType, AiTone, PriceMode } from "@repo/shared";
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { Building, type GeoPoint } from "../buildings/building.entity";
import { Upload } from "../uploads/upload.entity";

@Entity({ name: "categories" })
export class Category {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column("text")
  name: string;

  @Column("text")
  slug: string;

  @Column("text")
  icon: string;

  @Column("integer")
  sortOrder: number;

  @Column("boolean")
  active: boolean;
}

@Entity({ name: "ads" })
export class Ad {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column("uuid")
  userId: string;

  @Column("uuid")
  buildingId: string;

  @ManyToOne(() => Building)
  @JoinColumn({ name: "building_id" })
  building: Building;

  @Column({ type: "enum", enum: ["servico", "produto", "procura"], enumName: "ad_type" })
  type: AdType;

  @Column("uuid")
  categoryId: string;

  @ManyToOne(() => Category)
  @JoinColumn({ name: "category_id" })
  category: Category;

  @Column("text")
  title: string;

  @Column("text")
  description: string;

  @Column({
    type: "enum",
    enum: ["fixo", "a_partir_de", "a_combinar", "gratuito"],
    enumName: "price_mode",
  })
  priceMode: PriceMode;

  @Column("integer", { nullable: true })
  priceCents: number | null;

  @Column("integer")
  radiusM: number;

  @Column({ type: "geography", spatialFeatureType: "Point", srid: 4326 })
  location: GeoPoint;

  @Column("boolean")
  whatsappEnabled: boolean;

  @Column("text", { nullable: true })
  availability: string | null;

  @Column("text", { array: true })
  tags: string[];

  @Column({
    type: "enum",
    enum: ["rascunho", "em_moderacao", "ativo", "pausado", "expirado", "removido", "excluido"],
    enumName: "ad_status",
  })
  status: AdStatus;

  @Column("text", { nullable: true })
  statusReason: string | null;

  @Column("boolean")
  aiGenerated: boolean;

  @Column("timestamptz", { nullable: true })
  expiresAt: Date | null;

  @Column("timestamptz", { nullable: true })
  bumpedAt: Date | null;

  @Column("timestamptz", { nullable: true })
  publishedAt: Date | null;

  @Column("timestamptz", { nullable: true })
  expiryWarnedAt: Date | null;

  @Column("integer")
  reportCount: number;

  @OneToMany(
    () => AdImage,
    (image) => image.ad,
  )
  images: AdImage[];

  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt: Date;
}

@Entity({ name: "ad_images" })
export class AdImage {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column("uuid")
  adId: string;

  @ManyToOne(
    () => Ad,
    (ad) => ad.images,
    { onDelete: "CASCADE" },
  )
  @JoinColumn({ name: "ad_id" })
  ad: Ad;

  @Column("uuid")
  uploadId: string;

  @ManyToOne(() => Upload)
  @JoinColumn({ name: "upload_id" })
  upload: Upload;

  @Column("smallint")
  position: number;
}

@Entity({ name: "ai_ad_drafts" })
export class AiAdDraft {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column("uuid")
  userId: string;

  @Column("text")
  kind: "gerar" | "melhorar";

  @Column("text", { nullable: true })
  inputText: string | null;

  @Column("uuid", { array: true })
  inputUploadIds: string[];

  @Column({ type: "enum", enum: ["amigavel", "formal", "direto"], enumName: "ai_tone" })
  tone: AiTone;

  @Column("jsonb")
  output: Record<string, unknown>;

  @Column("uuid", { nullable: true })
  adId: string | null;

  @Column("text")
  model: string;

  @Column("text")
  promptVersion: string;

  @Column("integer", { nullable: true })
  tokensIn: number | null;

  @Column("integer", { nullable: true })
  tokensOut: number | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;
}

@Entity({ name: "ad_moderations" })
export class AdModeration {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column("uuid")
  adId: string;

  @Column({
    type: "enum",
    enum: ["aprovado", "revisar", "proibido"],
    enumName: "moderation_decision",
  })
  decision: "aprovado" | "revisar" | "proibido";

  @Column({ type: "enum", enum: ["ia", "regras", "admin"], enumName: "verification_decider" })
  decidedBy: "ia" | "regras" | "admin";

  @Column("text", { array: true })
  violatedCategories: string[];

  @Column("text", { nullable: true })
  reason: string | null;

  @Column("numeric", {
    precision: 3,
    scale: 2,
    nullable: true,
    transformer: { to: (v) => v, from: (v) => (v === null ? null : Number(v)) },
  })
  confidence: number | null;

  @Column("uuid", { nullable: true })
  reviewerId: string | null;

  @Column("text", { nullable: true })
  model: string | null;

  @Column("text", { nullable: true })
  promptVersion: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;
}
