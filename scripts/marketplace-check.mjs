import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const listing = JSON.parse(
  fs.readFileSync(path.join(root, 'release/marketplace.json')),
);
if (
  listing.free !== true ||
  Object.hasOwn(listing, 'pricing') ||
  listing.name !== 'DeckShep' ||
  listing.description.length < 250 ||
  listing.description.length > 1500 ||
  !listing.aiDisclosure
)
  throw Error('Listing name, description length or AI disclosure invalid');
const expected = [
  'app-icon.png',
  'thumbnail.png',
  'gallery-overview.png',
  'gallery-context.png',
  'gallery-questions.png',
];
if (
  listing.media?.length !== expected.length ||
  expected.some((name) => !listing.media.includes(name))
)
  throw Error('Marketplace media inventory incomplete');
const directory = path.join(root, 'dist/marketplace');
const info = JSON.parse(
  fs.readFileSync(path.join(directory, 'MEDIA-INFO.json')),
);
if (
  info.product !== listing.name ||
  info.status !== 'private-review' ||
  info.data !== 'synthetic'
)
  throw Error('Unexpected preview provenance');
for (const name of expected) {
  const data = fs.readFileSync(path.join(directory, name));
  const [width, height] = name === 'app-icon.png' ? [288, 288] : [1920, 960];
  if (
    data.length < 24 ||
    data.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
    data.readUInt32BE(16) !== width ||
    data.readUInt32BE(20) !== height
  )
    throw Error('Marketplace image format/dimensions invalid: ' + name);
  if (
    createHash('sha256').update(data).digest('hex') !==
    info.files?.find((file) => file.name === name)?.sha256
  )
    throw Error('Preview checksum mismatch: ' + name);
}
console.log(
  'Draft listing and five private-review PNGs verified. This does not approve publication.',
);
