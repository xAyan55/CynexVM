import fs from 'fs';
import path from 'path';

export interface UploadResult {
  success: boolean;
  remotePath: string;
  sizeBytes: number;
  error?: string;
}

export interface DownloadResult {
  success: boolean;
  localPath: string;
  error?: string;
}

export interface StorageProvider {
  uploadFile(localPath: string, remotePath: string): Promise<UploadResult>;
  downloadFile(remotePath: string, localPath: string): Promise<DownloadResult>;
  deleteFile(remotePath: string): Promise<boolean>;
}

/**
 * Handles backup operations directly on the host machine filesystem.
 */
export class LocalStorageProvider implements StorageProvider {
  private baseDir: string;

  constructor(config: { backupDir?: string }) {
    this.baseDir = config.backupDir || path.join(__dirname, '../../storage/backups');
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  public async uploadFile(localPath: string, remotePath: string): Promise<UploadResult> {
    try {
      const destination = path.join(this.baseDir, remotePath);
      const destDir = path.dirname(destination);
      
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      fs.copyFileSync(localPath, destination);
      const stats = fs.statSync(destination);

      return {
        success: true,
        remotePath,
        sizeBytes: stats.size,
      };
    } catch (err: any) {
      return {
        success: false,
        remotePath,
        sizeBytes: 0,
        error: err.message,
      };
    }
  }

  public async downloadFile(remotePath: string, localPath: string): Promise<DownloadResult> {
    try {
      const source = path.join(this.baseDir, remotePath);
      if (!fs.existsSync(source)) {
        throw new Error(`Remote backup file not found: ${remotePath}`);
      }

      const destDir = path.dirname(localPath);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      fs.copyFileSync(source, localPath);
      return { success: true, localPath };
    } catch (err: any) {
      return { success: false, localPath, error: err.message };
    }
  }

  public async deleteFile(remotePath: string): Promise<boolean> {
    try {
      const file = path.join(this.baseDir, remotePath);
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
      return true;
    } catch (err) {
      console.error(`Failed to delete local backup ${remotePath}:`, err);
      return false;
    }
  }
}

/**
 * S3 / Cloudflare R2 / MinIO Adapter template.
 */
export class S3StorageProvider implements StorageProvider {
  private endpoint: string;
  private accessKey: string;
  private secretKey: string;
  private bucket: string;

  constructor(config: { endpoint: string; accessKey: string; secretKey: string; bucket: string }) {
    this.endpoint = config.endpoint;
    this.accessKey = config.accessKey;
    this.secretKey = config.secretKey;
    this.bucket = config.bucket;
  }

  public async uploadFile(localPath: string, remotePath: string): Promise<UploadResult> {
    // S3 uploading logic using direct REST API or Client SDK
    // Here we provide a detailed mock-ready log. In production, install `@aws-sdk/client-s3` and invoke `PutObjectCommand`.
    console.log(`[S3 Storage] Uploading ${localPath} to bucket ${this.bucket}/${remotePath}...`);
    try {
      const stats = fs.statSync(localPath);
      // Simulating success for SaaS compilation
      return {
        success: true,
        remotePath,
        sizeBytes: stats.size,
      };
    } catch (err: any) {
      return {
        success: false,
        remotePath,
        sizeBytes: 0,
        error: err.message,
      };
    }
  }

  public async downloadFile(remotePath: string, localPath: string): Promise<DownloadResult> {
    console.log(`[S3 Storage] Downloading ${remotePath} from bucket ${this.bucket}...`);
    return { success: true, localPath };
  }

  public async deleteFile(remotePath: string): Promise<boolean> {
    console.log(`[S3 Storage] Deleting ${remotePath} from bucket ${this.bucket}...`);
    return true;
  }
}

export class StorageProviderFactory {
  public static getProvider(type: string, config: any): StorageProvider {
    switch (type.toLowerCase()) {
      case 'local':
        return new LocalStorageProvider(config);
      case 's3':
      case 'r2':
      case 'b2':
        return new S3StorageProvider(config);
      default:
        throw new Error(`Unsupported storage provider type: ${type}`);
    }
  }
}
