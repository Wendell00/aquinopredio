import type { NotificationPrefs, UserRole, UserStatus } from "@repo/shared";
import { Column, CreateDateColumn, Entity, PrimaryColumn } from "typeorm";

/** Tabela `users`: identidade (Better Auth) + colunas do app. Linhas são criadas pelo Better Auth. */
@Entity({ name: "users" })
export class User {
  @PrimaryColumn("uuid")
  id: string;

  /** Nome de exibição (RN-006). */
  @Column("text")
  name: string;

  @Column("text")
  email: string;

  @Column("boolean")
  emailVerified: boolean;

  @Column("text", { nullable: true })
  image: string | null;

  @Column("text", { nullable: true })
  phone: string | null;

  @Column({
    type: "enum",
    enum: ["onboarding_pendente", "ativo", "suspenso", "banido", "excluido"],
    enumName: "user_status",
  })
  status: UserStatus;

  @Column({ type: "enum", enum: ["user", "platform_admin"], enumName: "user_role" })
  role: UserRole;

  @Column("uuid", { nullable: true })
  primaryBuildingId: string | null;

  @Column("timestamptz", { nullable: true })
  termsAcceptedAt: Date | null;

  @Column("timestamptz", { nullable: true })
  suspendedUntil: Date | null;

  @Column("jsonb")
  notificationPrefs: Partial<NotificationPrefs>;

  @Column("timestamptz", { nullable: true })
  deletedAt: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;

  @Column("timestamptz")
  updatedAt: Date;
}
