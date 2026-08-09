import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';

const MIME_TYPES = {
  '.avif': 'image/avif',
  '.csv': 'text/csv',
  '.gif': 'image/gif',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
  '.mov': 'video/quicktime',
  '.mp4': 'video/mp4',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
  '.zip': 'application/zip',
};

const DEFAULT_EXTENSIONS = {
  'application/pdf': '.pdf',
  'image/avif': '.avif',
  'image/gif': '.gif',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/svg+xml': '.svg',
  'image/webp': '.webp',
  'model/gltf+json': '.gltf',
  'model/gltf-binary': '.glb',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
};

export function mimeTypeForFilename(filename) {
  return MIME_TYPES[extname(filename).toLowerCase()] || 'application/octet-stream';
}

export function fileContentTypeForMimeType(mimeType) {
  if (mimeType.startsWith('image/')) return 'IMAGE';
  if (mimeType.startsWith('video/')) return 'VIDEO';
  if (mimeType === 'model/gltf-binary' || mimeType === 'model/gltf+json') {
    return 'MODEL_3D';
  }
  return 'FILE';
}

export function stagedResourceForContentType(contentType) {
  return contentType === 'MODEL_3D' ? 'MODEL_3D' : contentType;
}

function decodeBase64(value) {
  const match = value.match(/^data:([^;,]+)?;base64,(.*)$/s);
  const encoded = (match ? match[2] : value).replace(/\s/g, '');
  if (!encoded || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4 !== 0) {
    throw new Error('base64_data is not valid base64');
  }

  return {
    buffer: Buffer.from(encoded, 'base64'),
    dataUriMimeType: match?.[1] || null,
  };
}

export function resolveUploadData(args) {
  const providedSources = [args.file_path, args.base64_data].filter(Boolean);
  if (providedSources.length !== 1) {
    throw new Error('Provide exactly one of file_path or base64_data');
  }

  if (args.file_path) {
    const filename = args.filename || basename(args.file_path);
    return {
      buffer: readFileSync(args.file_path),
      filename,
      mimeType: args.mime_type || mimeTypeForFilename(filename),
    };
  }

  const { buffer, dataUriMimeType } = decodeBase64(args.base64_data);
  const detectedMimeType = args.mime_type || dataUriMimeType;
  const filename =
    args.filename || `upload${DEFAULT_EXTENSIONS[detectedMimeType] || '.bin'}`;
  return {
    buffer,
    filename,
    mimeType: detectedMimeType || mimeTypeForFilename(filename),
  };
}

function safeFilename(filename) {
  return filename.replace(/[\r\n"]/g, '_');
}

export async function stageUpload({
  shopifyGQL,
  fetchImpl = fetch,
  buffer,
  filename,
  mimeType,
  resource,
}) {
  const stagedMutation = `
    mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets {
          url
          resourceUrl
          parameters {
            name
            value
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;
  const stagedResult = await shopifyGQL(stagedMutation, {
    input: [
      {
        filename,
        mimeType,
        httpMethod: 'POST',
        resource,
        fileSize: String(buffer.length),
      },
    ],
  });
  const payload = stagedResult.stagedUploadsCreate;
  if (payload.userErrors?.length) {
    throw new Error(`Staged upload errors: ${JSON.stringify(payload.userErrors)}`);
  }

  const target = payload.stagedTargets?.[0];
  if (!target) throw new Error('Shopify did not return a staged upload target');

  const boundary = `----ShopifyMcpBoundary${Date.now().toString(36)}`;
  const parameterParts = target.parameters.map(
    ({ name, value }) =>
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
  );
  const fileHeader = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${safeFilename(filename)}"\r\nContent-Type: ${mimeType}\r\n\r\n`;
  const body = Buffer.concat([
    Buffer.from(parameterParts.join(''), 'utf8'),
    Buffer.from(fileHeader, 'utf8'),
    buffer,
    Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'),
  ]);

  const uploadResponse = await fetchImpl(target.url, {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': String(body.length),
    },
    body,
  });
  if (!uploadResponse.ok) {
    const responseBody = await uploadResponse.text();
    throw new Error(`Upload failed (${uploadResponse.status}): ${responseBody}`);
  }

  return target.resourceUrl;
}
