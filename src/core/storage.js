import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'node:crypto';

const DEFAULT_UPLOAD_TTL_SECONDS = 300;

export function createStorage(input = {}) {
  const config = normalizeStorageConfig(input);
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

  const storage = {
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

    async createUploadUrl({
      objectKey,
      prefix,
      contentType,
      contentLength,
      expiresIn = config.uploadTtlSeconds || DEFAULT_UPLOAD_TTL_SECONDS,
    }) {
      requireConfigured();
      if (!Number.isInteger(contentLength) || contentLength <= 0) {
        throwStorageError(400, 'UPLOAD_SIZE_REQUIRED', 'Upload content length is required');
      }

      const key = objectKey || `${prefix}/${crypto.randomUUID()}${extensionForContentType(contentType)}`;
      const command = new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        ContentType: contentType,
        ContentLength: contentLength,
      });
      const uploadUrl = await getSignedUrl(client, command, { expiresIn });
      return { objectKey: key, uploadUrl, expiresIn };
    },

    async inspectObject(objectKey) {
      requireConfigured();
      const result = await client.send(new HeadObjectCommand({
        Bucket: config.bucket,
        Key: objectKey,
      }));
      return {
        objectKey,
        contentType: result.ContentType ?? '',
        contentLength: Number(result.ContentLength ?? 0),
      };
    },

    async readObject(objectKey, { maxBytes = 10 * 1024 * 1024 } = {}) {
      requireConfigured();
      const result = await client.send(new GetObjectCommand({
        Bucket: config.bucket,
        Key: objectKey,
      }));
      const declaredLength = Number(result.ContentLength ?? 0);
      if (declaredLength > maxBytes) {
        throwStorageError(400, 'OBJECT_TOO_LARGE', 'Stored object exceeds the allowed size');
      }

      const chunks = [];
      let total = 0;
      for await (const chunk of result.Body ?? []) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += buffer.length;
        if (total > maxBytes) {
          throwStorageError(400, 'OBJECT_TOO_LARGE', 'Stored object exceeds the allowed size');
        }
        chunks.push(buffer);
      }

      return {
        objectKey,
        contentType: result.ContentType ?? '',
        contentLength: total,
        body: Buffer.concat(chunks, total),
      };
    },

    async moveObject(sourceKey, destinationKey) {
      requireConfigured();
      await client.send(new CopyObjectCommand({
        Bucket: config.bucket,
        Key: destinationKey,
        CopySource: encodeCopySource(config.bucket, sourceKey),
        MetadataDirective: 'COPY',
      }));
      await client.send(new DeleteObjectCommand({
        Bucket: config.bucket,
        Key: sourceKey,
      }));
      return { objectKey: destinationKey, url: storage.objectUrl(destinationKey) };
    },

    async putObject({ objectKey, body, contentType }) {
      requireConfigured();
      await client.send(new PutObjectCommand({
        Bucket: config.bucket,
        Key: objectKey,
        Body: body,
        ContentType: contentType,
      }));
      return { objectKey, url: storage.objectUrl(objectKey) };
    },

    async deleteObject(objectKey) {
      requireConfigured();
      await client.send(new DeleteObjectCommand({
        Bucket: config.bucket,
        Key: objectKey,
      }));
    },

    async getPrefixUsage(prefix) {
      requireConfigured();
      let continuationToken;
      let objectCount = 0;
      let totalBytes = 0;

      do {
        const result = await client.send(new ListObjectsV2Command({
          Bucket: config.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }));
        for (const object of result.Contents ?? []) {
          objectCount += 1;
          totalBytes += Number(object.Size ?? 0);
        }
        continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
      } while (continuationToken);

      return { prefix, objectCount, totalBytes };
    },

    async createDownloadUrl(objectKey) {
      if (!configured) return null;
      const command = new GetObjectCommand({ Bucket: config.bucket, Key: objectKey });
      return getSignedUrl(client, command, { expiresIn: 600 });
    },
  };

  return storage;

  function requireConfigured() {
    if (!configured) {
      throwStorageError(503, 'STORAGE_NOT_CONFIGURED', 'Storage bucket is not configured');
    }
  }
}

export function extensionForContentType(contentType) {
  if (contentType === 'image/png') return '.png';
  if (contentType === 'image/webp') return '.webp';
  return '.jpg';
}

function throwStorageError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  throw error;
}

function encodeCopySource(bucket, objectKey) {
  const encodedKey = objectKey.split('/').map(encodeURIComponent).join('/');
  return `${encodeURIComponent(bucket)}/${encodedKey}`;
}

function normalizeStorageConfig(input) {
  if (input.bucket || input.endpoint || input.accessKeyId || input.secretAccessKey) {
    return {
      bucket: input.bucket || '',
      endpoint: input.endpoint || '',
      region: input.region || 'auto',
      accessKeyId: input.accessKeyId || '',
      secretAccessKey: input.secretAccessKey || '',
      publicBaseUrl: input.publicBaseUrl || '',
      uploadTtlSeconds: input.uploadTtlSeconds || DEFAULT_UPLOAD_TTL_SECONDS,
    };
  }

  return {
    bucket: firstValue(input, ['S3_BUCKET', 'S3_BUCKET_NAME', 'AWS_S3_BUCKET_NAME', 'BUCKET_NAME', 'RAILWAY_BUCKET_NAME']),
    endpoint: firstValue(input, ['S3_ENDPOINT', 'S3_ENDPOINT_URL', 'AWS_ENDPOINT_URL', 'AWS_ENDPOINT_URL_S3', 'RAILWAY_S3_ENDPOINT']),
    region: firstValue(input, ['S3_REGION', 'AWS_REGION', 'AWS_DEFAULT_REGION']) || 'auto',
    accessKeyId: firstValue(input, ['S3_ACCESS_KEY_ID', 'AWS_ACCESS_KEY_ID']),
    secretAccessKey: firstValue(input, ['S3_SECRET_ACCESS_KEY', 'AWS_SECRET_ACCESS_KEY']),
    publicBaseUrl: firstValue(input, ['S3_PUBLIC_BASE_URL', 'BUCKET_PUBLIC_BASE_URL', 'STORAGE_PUBLIC_BASE_URL']),
    uploadTtlSeconds: DEFAULT_UPLOAD_TTL_SECONDS,
  };
}

function firstValue(input, names) {
  for (const name of names) {
    if (input[name]) return input[name];
  }
  return '';
}
