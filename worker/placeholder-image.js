import { deflateSync } from 'node:zlib';

// 소모임 앱은 정모 사진 없이는 제출을 받지 않는다(실기기 확인). 사진을 넣을 수단이
// 필요한데, 저장소에 바이너리를 두지 않으려고 최소한의 PNG를 코드로 만든다.
// 실제 배너를 쓰려면 MEETUP_PHOTO_PATH로 파일을 지정한다.
//
// 폼이 요구하는 비율이 16:9다. 다른 비율을 넣으면 크롭 화면에서 잘려 결과를
// 예측하기 어려우므로 처음부터 16:9로 만든다.
const DEFAULT_WIDTH = 1600;
const DEFAULT_HEIGHT = 900;
const DEFAULT_COLOR = [120, 150, 200];

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, checksum]);
}

export function createSolidPng({
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  color = DEFAULT_COLOR,
} = {}) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: truecolour
  // 10~12은 압축/필터/인터레이스 방식이며 PNG 표준값 0이 전부다.

  // 각 행은 필터 바이트 0(None)으로 시작하고 그 뒤에 RGB 픽셀이 이어진다.
  const row = Buffer.concat([
    Buffer.from([0]),
    Buffer.from(Array.from({ length: width }, () => color).flat()),
  ]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
