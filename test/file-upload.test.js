import test from 'node:test';
import assert from 'node:assert/strict';

import {
  fileContentTypeForMimeType,
  mimeTypeForFilename,
  resolveUploadData,
  stageUpload,
  stagedResourceForContentType,
} from '../src/file-upload.js';

test('infers common Shopify file content types', () => {
  assert.equal(mimeTypeForFilename('hero.webp'), 'image/webp');
  assert.equal(mimeTypeForFilename('manual.pdf'), 'application/pdf');
  assert.equal(fileContentTypeForMimeType('image/png'), 'IMAGE');
  assert.equal(fileContentTypeForMimeType('video/mp4'), 'VIDEO');
  assert.equal(fileContentTypeForMimeType('model/gltf-binary'), 'MODEL_3D');
  assert.equal(fileContentTypeForMimeType('application/pdf'), 'FILE');
  assert.equal(stagedResourceForContentType('MODEL_3D'), 'MODEL_3D');
});

test('resolves a base64 data URI and its MIME type', () => {
  const upload = resolveUploadData({
    base64_data: 'data:image/png;base64,aGVsbG8=',
    filename: 'hello.png',
  });

  assert.equal(upload.buffer.toString('utf8'), 'hello');
  assert.equal(upload.filename, 'hello.png');
  assert.equal(upload.mimeType, 'image/png');
});

test('derives a filename from a base64 data URI', () => {
  const upload = resolveUploadData({
    base64_data: 'data:image/webp;base64,aGVsbG8=',
  });

  assert.equal(upload.filename, 'upload.webp');
  assert.equal(upload.mimeType, 'image/webp');
});

test('requires exactly one binary upload source', () => {
  assert.throws(() => resolveUploadData({}), /exactly one/);
  assert.throws(
    () => resolveUploadData({ file_path: '/tmp/a', base64_data: 'YQ==' }),
    /exactly one/
  );
});

test('rejects malformed base64', () => {
  assert.throws(
    () => resolveUploadData({ base64_data: 'not-base64', filename: 'bad.bin' }),
    /not valid base64/
  );
});

test('creates and posts a staged upload with file size metadata', async () => {
  let stagedVariables;
  let uploadRequest;
  const resourceUrl = await stageUpload({
    shopifyGQL: async (_query, variables) => {
      stagedVariables = variables;
      return {
        stagedUploadsCreate: {
          stagedTargets: [
            {
              url: 'https://uploads.example.test',
              resourceUrl: 'https://shop.example.test/staged/image.png',
              parameters: [{ name: 'key', value: 'staged/image.png' }],
            },
          ],
          userErrors: [],
        },
      };
    },
    fetchImpl: async (url, options) => {
      uploadRequest = { url, options };
      return { ok: true };
    },
    buffer: Buffer.from('image bytes'),
    filename: 'image.png',
    mimeType: 'image/png',
    resource: 'IMAGE',
  });

  assert.equal(resourceUrl, 'https://shop.example.test/staged/image.png');
  assert.equal(stagedVariables.input[0].fileSize, '11');
  assert.equal(stagedVariables.input[0].resource, 'IMAGE');
  assert.equal(uploadRequest.url, 'https://uploads.example.test');
  assert.equal(
    Number(uploadRequest.options.headers['Content-Length']),
    uploadRequest.options.body.length
  );
  assert.match(uploadRequest.options.body.toString('utf8'), /image bytes/);
});
