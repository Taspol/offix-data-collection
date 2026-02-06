import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Res,
  HttpStatus,
  HttpException,
  UseInterceptors,
  UploadedFile,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { StorageService } from './storage.service';

@Controller('api/storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Query('path') storagePath: string,
  ) {
    try {
      if (!file) {
        throw new HttpException('No file provided', HttpStatus.BAD_REQUEST);
      }

      if (!storagePath) {
        throw new HttpException(
          'Storage path is required',
          HttpStatus.BAD_REQUEST,
        );
      }

      await this.storageService.saveFile(storagePath, file.buffer);

      return {
        success: true,
        storagePath,
        size: file.size,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Upload failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('download/:path(*)')
  async downloadFile(@Param('path') storagePath: string, @Res() res: Response) {
    try {
      const fileBuffer = await this.storageService.getFile(storagePath);

      res.setHeader('Content-Type', 'video/webm');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${storagePath.split('/').pop()}"`,
      );
      res.send(fileBuffer);
    } catch (error) {
      throw new HttpException(
        'File not found',
        HttpStatus.NOT_FOUND,
      );
    }
  }
}
