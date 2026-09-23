import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';

const root = resolve(import.meta.dirname, '..');
const directory = join(root, 'public/assets/mascot-v1');
const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'));
const pack = manifest.hd_derivatives;
if (!pack || pack.files?.length !== 8 || pack.dimensions?.join('x') !== '720x900') {
  throw new Error('Approved 8-state HD manifest missing or invalid.');
}
const expected = new Map(pack.files.map(item => [item.file, item]));
const digest = data => createHash('sha256').update(data).digest('hex');
function validate(name, bytes) {
  const entry = expected.get(name);
  if (!entry || entry.size_bytes !== bytes.length || digest(bytes) !== entry.sha256) {
    throw new Error(`Mascot HD checksum mismatch: ${name}`);
  }
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' ||
      bytes.toString('ascii', 8, 16) !== 'WEBPVP8X' ||
      bytes.readUIntLE(24, 3) + 1 !== 720 ||
      bytes.readUIntLE(27, 3) + 1 !== 900) {
    throw new Error(`Mascot HD format or dimensions invalid: ${name}`);
  }
}
function readZipEntries(zip) {
  // Read ZIP central directory without requiring system unzip or Python.
  let end = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); --i) {
    if (zip.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  }
  if (end === -1) throw new Error('Invalid mascot ZIP: central directory missing');
  const count = zip.readUInt16LE(end + 10);
  let pos = zip.readUInt32LE(end + 16);
  const result = new Map();
  for (let n = 0; n < count; n++) {
    if (zip.readUInt32LE(pos) !== 0x02014b50) throw new Error('Invalid mascot ZIP entry');
    const method = zip.readUInt16LE(pos + 10);
    const length = zip.readUInt32LE(pos + 20);
    const filenameLength = zip.readUInt16LE(pos + 28);
    const extraLength = zip.readUInt16LE(pos + 30);
    const commentLength = zip.readUInt16LE(pos + 32);
    const filename = zip.toString('utf8', pos + 46, pos + 46 + filenameLength);
    const basename = filename.split('/').at(-1);
    if (expected.has(basename) && filename === `public/assets/mascot-v1/${basename}`) {
      const local = zip.readUInt32LE(pos + 42);
      if (zip.readUInt32LE(local) !== 0x04034b50) throw new Error('Invalid mascot ZIP local entry');
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const compressed = zip.subarray(start, start + length);
      const data = method === 8 ? inflateRawSync(compressed) : method === 0 ? compressed : null;
      if (!data) throw new Error(`Unsupported mascot ZIP compression for ${basename}`);
      validate(basename, data);
      result.set(basename, data);
    }
    pos += 46 + filenameLength + extraLength + commentLength;
  }
  return result;
}

const missing = pack.files.filter(item => !existsSync(join(directory, item.file)));
if (missing.length) {
  const archive = join(root, 'JoTrip_Mascot_HD_8_States_2026-09-23.zip');
  if (!existsSync(archive)) {
    throw new Error(`${missing.length} locked HD assets missing. Upload JoTrip_Mascot_HD_8_States_2026-09-23.zip to the repository root before building.`);
  }
  const entries = readZipEntries(readFileSync(archive));
  if (entries.size !== expected.size) throw new Error(`Incomplete mascot ZIP: ${entries.size}/8 verified assets`);
  mkdirSync(directory, { recursive: true });
  for (const [filename, data] of entries) writeFileSync(join(directory, filename), data);
  console.log('Installed 8 locked mascot HD assets from the approved ZIP.');
}
for (const item of pack.files) validate(item.file, readFileSync(join(directory, item.file)));
console.log('Mascot HD asset gate passed: 8/8 files, 720x900, all approved SHA-256 values.');
