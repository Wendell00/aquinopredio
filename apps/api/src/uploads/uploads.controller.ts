import {
  BadRequestException,
  Controller,
  ParseEnumPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Throttle } from "@nestjs/throttler";
import type { UploadedImage } from "@repo/shared";
import { CurrentUser } from "../common/decorators/auth.decorators";
import type { User } from "../users/user.entity";
import { MAX_UPLOAD_BYTES } from "./image-processing";
import { UploadsService } from "./uploads.service";

const PURPOSES = ["ad", "avatar", "chat"] as const;

@Controller("uploads")
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post("images")
  @Throttle({ default: { limit: 60, ttl: 60 * 60_000 } })
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 0 } }),
  )
  async image(
    @CurrentUser() user: User,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query("purpose", new ParseEnumPipe(PURPOSES, { optional: true }))
    purpose: (typeof PURPOSES)[number] = "ad",
  ): Promise<UploadedImage> {
    if (!file) throw new BadRequestException("Envie uma imagem no campo `file`");
    return this.uploads.uploadImage(user.id, file.buffer, purpose);
  }
}
