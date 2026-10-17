import type { BuildingStatus, BuildingType, MembershipStatus } from "@repo/shared";
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

/** GeoJSON devolvido pelo TypeORM para colunas `geography(Point)`: [longitude, latitude]. */
export interface GeoPoint {
  type: "Point";
  coordinates: [number, number];
}

@Entity({ name: "buildings" })
export class Building {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column("text")
  name: string;

  @Column({ type: "enum", enum: ["edificio", "condominio_horizontal"], enumName: "building_type" })
  type: BuildingType;

  @Column("char", { length: 8 })
  cep: string;

  @Column("text")
  street: string;

  @Column("text")
  number: string;

  @Column("text")
  district: string;

  @Column("text")
  city: string;

  @Column("char", { length: 2 })
  state: string;

  @Column({ type: "geography", spatialFeatureType: "Point", srid: 4326 })
  location: GeoPoint;

  @Column("integer", { nullable: true })
  unitsEstimate: number | null;

  @Column("text", { nullable: true })
  facadePhotoUrl: string | null;

  @Column({
    type: "enum",
    enum: ["pendente_validacao", "verificado", "pendente_revisao", "rejeitado", "arquivado"],
    enumName: "building_status",
  })
  status: BuildingStatus;

  @Column("uuid", { nullable: true })
  createdBy: string | null;

  @Column("integer")
  resubmissions: number;

  @Column("text", { nullable: true })
  rejectionReason: string | null;

  @Column("text", { nullable: true })
  suggestedName: string | null;

  @Column("timestamptz")
  lastActivityAt: Date;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt: Date;
}

@Entity({ name: "building_memberships" })
export class BuildingMembership {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column("uuid")
  userId: string;

  @Column("uuid")
  buildingId: string;

  @ManyToOne(() => Building, { onDelete: "CASCADE" })
  @JoinColumn({ name: "building_id" })
  building: Building;

  @Column("text")
  unit: string;

  @Column({
    type: "enum",
    enum: ["pendente", "ativo", "recusado", "removido"],
    enumName: "membership_status",
  })
  status: MembershipStatus;

  @Column("timestamptz", { nullable: true })
  verifiedAt: Date | null;

  @Column({
    type: "enum",
    enum: ["admin", "vizinhos", "comprovante"],
    enumName: "verification_method",
    nullable: true,
  })
  verifiedMethod: "admin" | "vizinhos" | "comprovante" | null;

  @Column("timestamptz", { nullable: true })
  decidedAt: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt: Date;
}

@Entity({ name: "building_verifications" })
export class BuildingVerification {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column("uuid")
  buildingId: string;

  @Column("jsonb")
  input: Record<string, unknown>;

  @Column("jsonb", { nullable: true })
  output: Record<string, unknown> | null;

  @Column("numeric", {
    precision: 3,
    scale: 2,
    nullable: true,
    transformer: { to: (v) => v, from: (v) => (v === null ? null : Number(v)) },
  })
  score: number | null;

  @Column({
    type: "enum",
    enum: ["verificado", "pendente_revisao", "rejeitado"],
    enumName: "verification_decision",
  })
  decision: "verificado" | "pendente_revisao" | "rejeitado";

  @Column({ type: "enum", enum: ["ia", "regras", "admin"], enumName: "verification_decider" })
  decidedBy: "ia" | "regras" | "admin";

  @Column("uuid", { nullable: true })
  reviewerId: string | null;

  @Column("text", { nullable: true })
  model: string | null;

  @Column("text", { nullable: true })
  promptVersion: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;
}
