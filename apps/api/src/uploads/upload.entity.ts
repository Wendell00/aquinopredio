import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";

export type UploadPurpose = "ad" | "avatar" | "chat" | "facade";

@Entity({ name: "uploads" })
export class Upload {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column("uuid")
  ownerId: string;

  @Column("text")
  key: string;

  @Column("text")
  thumbKey: string;

  @Column("integer")
  width: number;

  @Column("integer")
  height: number;

  @Column("integer")
  bytes: number;

  @Column("text")
  purpose: UploadPurpose;

  @Column("timestamptz", { nullable: true })
  attachedAt: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;
}
