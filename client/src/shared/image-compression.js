const DEFAULT_MAX_EDGE = 1600;
const DEFAULT_QUALITY = 0.8;

export async function compressImage(file, options = {}) {
  if (!file?.type?.startsWith('image/')) {
    throw new Error('이미지 파일만 사용할 수 있습니다.');
  }

  const maxEdge = options.maxEdge ?? DEFAULT_MAX_EDGE;
  const quality = options.quality ?? DEFAULT_QUALITY;
  const image = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0, width, height);
  image.close?.();

  const blob = await canvasToBlob(canvas, 'image/jpeg', quality);

  return new File([blob], normalizedFileName(file.name), {
    type: 'image/jpeg',
    lastModified: Date.now(),
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('이미지 압축에 실패했습니다.'));
      },
      type,
      quality,
    );
  });
}

function normalizedFileName(name) {
  const baseName = name.replace(/\.[^.]+$/, '') || 'verification';
  return `${baseName}.jpg`;
}
