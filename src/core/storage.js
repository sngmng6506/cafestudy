import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'node:crypto';

const DEFAULT_UPLOAD_TTL_SECONDS = 300;

export function createStorage(env) {
  const config = readStorageConfig(env);
  const configured = Boolean(
    config.bucket &&
    config.endpoint &&
    config.region &&
    config.accessKeyId &&
    config.secretAccessKey,
  );

  const client = configured
    ? new S3Client({
        region: config.region,
        endpoint: config.endpoint,
        forcePathStyle: true,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
      })
    : null;

  return {
    status() {
      return {
        configured,
        bucket: Boolean(config.bucket),
        endpoint: Boolean(config.endpoint),
        region: Boolean(config.region),
        accessKeyId: Boolean(config.accessKeyId),
        secretAccessKey: Boolean(config.secretAccessKey),
        publicBaseUrl: Boolean(config.publicBaseUrl),
      };
    },

    objectUrl(objectKey) {
      if (config.publicBaseUrl) {
        return `${config.publicBaseUrl.replace(/\/$/, '')}/${objectKey}`;
      }

      return objectKey;
    },

    async createUploadUrl({ prefix, contentType }) {
      if (!configured) {
        const error = new Error('Storage bucket is not configured');
        error.statusCode = 503;
        error.code = 'STORAGE_NOT_CONFIGURED';
        throw error;
      }

      const objectKey = `${prefix}/${crypto.randomUUID()}.jpg`;
      const command = new PutObjectCommand({
        Bucket: config.bucket,
        Key: objectKey,
        ContentType: contentType,
      });

      const uploadUrl = await getSignedUrl(client, command, {
        expiresIn: DEFAULT_UPLOAD_TTL_SECONDS,
      });

      return {
        objectKey,
        uploadUrl,
        photoUrl: this.objectUrl(objectKey),
        expiresIn: DEFAULT_UPLOAD_TTL_SECONDS,
      };
    },
  };
}

function readStorageConfig(env) {
  return {
    bucket: firstValue(env, ['S3_BUCKET', 'S3_BUCKET_NAME', 'AWS_S3_BUCKET_NAME', 'BUCKET_NAME', 'RAILWAY_BUCKET_NAME']),
    endpoint: firstValue(env, ['S3_ENDPOINT', 'S3_ENDPOINT_URL', 'AWS_ENDPOINT_URL', 'AWS_ENDPOINT_URL_S3', 'RAILWAY_S3_ENDPOINT']),
    region: firstValue(env, ['S3_REGION', 'AWS_REGION', 'AWS_DEFAULT_REGION']) ?? 'auto',
    accessKeyId: firstValue(env, ['S3_ACCESS_KEY_ID', 'AWS_ACCESS_KEY_ID']),
    secretAccessKey: firstValue(env, ['S3_SECRET_ACCESS_KEY', 'AWS_SECRET_ACCESS_KEY']),
    publicBaseUrl: firstValue(env, ['S3_PUBLIC_BASE_URL', 'BUCKET_PUBLIC_BASE_URL', 'STORAGE_PUBLIC_BASE_URL']),
  };
}

function firstValue(env, names) {
  for (const name of names) {
    if (env[name]) return env[name];
  }

  return '';
}
