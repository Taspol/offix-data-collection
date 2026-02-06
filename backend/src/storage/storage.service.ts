import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as AWS from 'aws-sdk';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as path from 'path';
import * as fs from 'fs/promises';

export interface UploadUrlResponse {
  uploadUrl: string;
  storagePath: string;
  expiresIn: number;
}

@Injectable()
export class StorageService {
  private storageProvider: string;
  private s3: AWS.S3;
  private supabase: SupabaseClient;
  private bucket: string;
  private localStoragePath: string;
  private serverUrl: string;

  constructor(private configService: ConfigService) {
    this.storageProvider = this.configService.get('STORAGE_PROVIDER', 'local');
    this.bucket = this.configService.get(
      this.storageProvider === 's3' ? 'S3_BUCKET' : 'SUPABASE_BUCKET',
    );
    this.localStoragePath = this.configService.get('LOCAL_STORAGE_PATH', './uploads');
    this.serverUrl = this.configService.get('SERVER_URL', 'http://localhost:3001');

    if (this.storageProvider === 's3') {
      this.initializeS3();
    } else if (this.storageProvider === 'supabase') {
      this.initializeSupabase();
    } else if (this.storageProvider === 'local') {
      this.initializeLocal();
    }
  }

  private async initializeLocal() {
    // Create uploads directory if it doesn't exist
    try {
      await fs.mkdir(this.localStoragePath, { recursive: true });
    } catch (error) {
      console.error('Failed to create uploads directory:', error);
    }
  }

  private initializeS3() {
    this.s3 = new AWS.S3({
      region: this.configService.get('AWS_REGION'),
      accessKeyId: this.configService.get('AWS_ACCESS_KEY_ID'),
      secretAccessKey: this.configService.get('AWS_SECRET_ACCESS_KEY'),
    });
  }

  private initializeSupabase() {
    const supabaseUrl = this.configService.get('SUPABASE_URL');
    const supabaseKey = this.configService.get('SUPABASE_KEY');
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  async generateUploadUrl(
    sessionId: string,
    deviceType: string,
    viewType: string,
    postureLabel: string,
    recordingId: string,
  ): Promise<UploadUrlResponse> {
    const timestamp = Date.now();
    const filename = `${recordingId}.webm`;
    const storagePath = `sessions/${sessionId}/${deviceType}-${viewType}/${postureLabel}/${filename}`;

    const expiresIn = this.configService.get('UPLOAD_URL_EXPIRY', 300);

    if (this.storageProvider === 's3') {
      return this.generateS3UploadUrl(storagePath, expiresIn);
    } else if (this.storageProvider === 'supabase') {
      return this.generateSupabaseUploadUrl(storagePath, expiresIn);
    } else {
      return this.generateLocalUploadUrl(storagePath, expiresIn);
    }
  }

  private async generateS3UploadUrl(
    storagePath: string,
    expiresIn: number,
  ): Promise<UploadUrlResponse> {
    const uploadUrl = await this.s3.getSignedUrlPromise('putObject', {
      Bucket: this.bucket,
      Key: storagePath,
      Expires: expiresIn,
      ContentType: 'video/webm',
    });

    return {
      uploadUrl,
      storagePath,
      expiresIn,
    };
  }

  private async generateSupabaseUploadUrl(
    storagePath: string,
    expiresIn: number,
  ): Promise<UploadUrlResponse> {
    // Supabase requires creating a signed upload URL
    const { data, error } = await this.supabase.storage
      .from(this.bucket)
      .createSignedUploadUrl(storagePath);

    if (error) {
      throw new Error(`Failed to generate upload URL: ${error.message}`);
    }

    return {
      uploadUrl: data.signedUrl,
      storagePath,
      expiresIn,
    };
  }

  private async generateLocalUploadUrl(
    storagePath: string,
    expiresIn: number,
  ): Promise<UploadUrlResponse> {
    // For local storage, return a URL that points to our upload endpoint
    const uploadUrl = `${this.serverUrl}/api/storage/upload`;
    
    return {
      uploadUrl,
      storagePath,
      expiresIn,
    };
  }

  async getDownloadUrl(storagePath: string, expiresIn = 3600): Promise<string> {
    if (this.storageProvider === 's3') {
      return this.s3.getSignedUrlPromise('getObject', {
        Bucket: this.bucket,
        Key: storagePath,
        Expires: expiresIn,
      });
    } else if (this.storageProvider === 'supabase') {
      const { data, error } = await this.supabase.storage
        .from(this.bucket)
        .createSignedUrl(storagePath, expiresIn);

      if (error) {
        throw new Error(`Failed to generate download URL: ${error.message}`);
      }

      return data.signedUrl;
    } else {
      // For local storage, return a URL to the file
      return `${this.serverUrl}/api/storage/download/${encodeURIComponent(storagePath)}`;
    }
  }

  async deleteFile(storagePath: string): Promise<void> {
    if (this.storageProvider === 's3') {
      await this.s3
        .deleteObject({
          Bucket: this.bucket,
          Key: storagePath,
        })
        .promise();
    } else if (this.storageProvider === 'supabase') {
      const { error } = await this.supabase.storage
        .from(this.bucket)
        .remove([storagePath]);

      if (error) {
        throw new Error(`Failed to delete file: ${error.message}`);
      }
    } else {
      // Delete local file
      const fullPath = path.join(this.localStoragePath, storagePath);
      try {
        await fs.unlink(fullPath);
      } catch (error) {
        console.error('Failed to delete local file:', error);
      }
    }
  }

  async saveFile(storagePath: string, fileBuffer: Buffer): Promise<void> {
    const fullPath = path.join(this.localStoragePath, storagePath);
    const directory = path.dirname(fullPath);
    
    // Create directory if it doesn't exist
    await fs.mkdir(directory, { recursive: true });
    
    // Write file
    await fs.writeFile(fullPath, fileBuffer);
  }

  async getFile(storagePath: string): Promise<Buffer> {
    const fullPath = path.join(this.localStoragePath, storagePath);
    return fs.readFile(fullPath);
  }
}
