import fs from 'node:fs';
import path from 'node:path';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
const crcTable = Array.from({ length: 256 }, (_, value) => {
  for (let i = 0; i < 8; i++)
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(data) {
  let value = 0xffffffff;
  for (const byte of data)
    value = crcTable[(value ^ byte) & 255] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}
export function safeName(name) {
  const parts = name.replace(/\/$/, '').split('/');
  if (
    !name ||
    name.startsWith('/') ||
    /^[A-Za-z]:/.test(name) ||
    /[\\\x00-\x1f\x7f]/.test(name) ||
    parts.some((p) => !p || p === '.' || p === '..')
  )
    throw Error('Unsafe archive path');
}
export function zip(files, { executableFiles = [] } = {}) {
  const executable = new Set(executableFiles);
  for (const name of executable)
    if (!files.has(name)) throw Error('Missing executable ZIP entry');
  const locals = [],
    entries = [];
  let offset = 0;
  for (const [name, contents] of files) {
    safeName(name);
    const bytes = Buffer.from(contents),
      encoded = Buffer.from(name),
      compressed = deflateRawSync(bytes);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc32(bytes), 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(bytes.length, 22);
    local.writeUInt16LE(encoded.length, 26);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50);
    entry.writeUInt16LE(0x0314, 4);
    local.copy(entry, 6, 4, 30);
    entry.writeUInt32LE(
      ((executable.has(name) ? 0o100755 : 0o100644) << 16) >>> 0,
      38,
    );
    entry.writeUInt32LE(offset, 42);
    locals.push(local, encoded, compressed);
    entries.push(entry, encoded);
    offset += local.length + encoded.length + compressed.length;
  }
  const central = Buffer.concat(entries),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(files.size, 8);
  end.writeUInt16LE(files.size, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, central, end]);
}
export function unzip(data, { modes } = {}) {
  const bytes = Buffer.from(data),
    files = new Map();
  let end = bytes.length - 22;
  while (
    end >= Math.max(0, bytes.length - 65557) &&
    bytes.readUInt32LE(end) !== 0x06054b50
  )
    end--;
  if (
    end < 0 ||
    end < bytes.length - 65557 ||
    bytes.readUInt16LE(end + 4) ||
    bytes.readUInt16LE(end + 6) ||
    bytes.readUInt16LE(end + 8) !== bytes.readUInt16LE(end + 10) ||
    end + 22 + bytes.readUInt16LE(end + 20) !== bytes.length
  )
    throw Error('Invalid ZIP directory');
  let cursor = bytes.readUInt32LE(end + 16),
    total = 0;
  const count = bytes.readUInt16LE(end + 10),
    directoryEnd = cursor + bytes.readUInt32LE(end + 12);
  if (count === 65535 || directoryEnd !== end)
    throw Error('Unsupported ZIP directory');
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50)
      throw Error('Invalid ZIP entry');
    const flags = bytes.readUInt16LE(cursor + 8),
      method = bytes.readUInt16LE(cursor + 10),
      crc = bytes.readUInt32LE(cursor + 16);
    let packed = bytes.readUInt32LE(cursor + 20),
      size = bytes.readUInt32LE(cursor + 24);
    const length = bytes.readUInt16LE(cursor + 28),
      extra = bytes.readUInt16LE(cursor + 30),
      comment = bytes.readUInt16LE(cursor + 32),
      mode = bytes.readUInt32LE(cursor + 38) >>> 16,
      start = bytes.readUInt32LE(cursor + 42);
    // Elgato's streaming ZIP writer uses ZIP64 entry sizes even for small
    // files. Decode only the declared fields, then apply the same size caps.
    if (size === 0xffffffff || packed === 0xffffffff) {
      let field = cursor + 46 + length,
        found = false;
      const limit = field + extra;
      if (limit > end) throw Error('Invalid ZIP64 field');
      while (field + 4 <= limit) {
        const kind = bytes.readUInt16LE(field),
          span = bytes.readUInt16LE(field + 2);
        field += 4;
        if (field + span > limit) throw Error('Invalid ZIP64 field');
        if (kind === 1) {
          let next = field;
          const value = () => {
            if (next + 8 > field + span) throw Error('Truncated ZIP64 size');
            const result = bytes.readBigUInt64LE(next);
            next += 8;
            if (result > BigInt(Number.MAX_SAFE_INTEGER))
              throw Error('Oversized ZIP64 entry');
            return Number(result);
          };
          if (size === 0xffffffff) size = value();
          if (packed === 0xffffffff) packed = value();
          found = true;
          break;
        }
        field += span;
      }
      if (!found) throw Error('Missing ZIP64 sizes');
    }
    const nameBytes = bytes.subarray(cursor + 46, cursor + 46 + length),
      name = nameBytes.toString('utf8');
    safeName(name);
    if (
      files.has(name) ||
      (mode && (mode & 0o170000) === 0o120000) ||
      flags & 1 ||
      ![0, 8].includes(method) ||
      size > 128e6 ||
      (total += size) > 512e6 ||
      cursor + 46 + length + extra + comment > end
    )
      throw Error('Unsafe or duplicate ZIP entry');
    if (
      start + 30 > cursor ||
      bytes.readUInt32LE(start) !== 0x04034b50 ||
      bytes.readUInt16LE(start + 8) !== method
    )
      throw Error('Invalid ZIP header');
    const localLength = bytes.readUInt16LE(start + 26),
      localExtra = bytes.readUInt16LE(start + 28),
      content = start + 30 + localLength + localExtra;
    if (
      !nameBytes.equals(bytes.subarray(start + 30, start + 30 + localLength)) ||
      content + packed > cursor
    )
      throw Error('ZIP header mismatch');
    const compressed = bytes.subarray(content, content + packed),
      output =
        method === 8
          ? inflateRawSync(compressed, { maxOutputLength: Math.max(1, size) })
          : compressed;
    if (output.length !== size || crc32(output) !== crc)
      throw Error('ZIP checksum mismatch');
    files.set(name, output);
    modes?.set(name, mode);
    cursor += 46 + length + extra + comment;
  }
  if (cursor !== directoryEnd) throw Error('Invalid ZIP directory size');
  return files;
}
export function readRegular(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink())
    throw Error('Unsafe release source file');
  return fs.readFileSync(file);
}
export function tree(directory, prefix = '') {
  const files = new Map();
  for (const entry of fs.readdirSync(directory)) {
    const file = path.join(directory, entry),
      stat = fs.lstatSync(file),
      name = prefix + entry;
    if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile()))
      throw Error('Unsafe build file');
    if (stat.isDirectory())
      for (const [key, data] of tree(file, name + '/')) files.set(key, data);
    else files.set(name, readRegular(file));
  }
  return files;
}
