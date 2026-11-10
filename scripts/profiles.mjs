import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { tree, zip } from './archive.mjs';
export const PROFILE_IDS = {
  rex: '9B48E1EC-B8FD-5A1A-AE1B-9C87F57F3F3F',
  herdr: 'AB25F8CF-5D02-51A5-8904-F666E35A500A',
  'herdr-app': '7297382B-CCCB-5C50-92B2-67B250A22A6B',
};
export const PAGE_IDS = {
  rex: '285BDB27-37E3-5BAA-907E-7258EF20FE77',
  herdr: 'A48A51FD-49CC-5DB3-96B0-39FD61DC6F1B',
  'herdr-app': 'F504DF11-D009-53EF-A108-44FDC8AD4C07',
};
export const PROFILE_NAMES = {
  rex: 'Rex',
  herdr: 'Herdr',
  'herdr-app': 'Herdr App',
};
/**
 * Profiles a default (release) build ships. The owner limited the first
 * release to Rex on 2026-11-10; the Herdr IDs above stay fixed for a later
 * release, and its code stays in source behind `experimental.herdr`.
 */
export const RELEASE_BACKENDS = Object.freeze(['rex']);
/** Profiles for one build: the release set plus explicitly enabled previews. */
export function buildBackends(experimental = {}) {
  return [
    ...RELEASE_BACKENDS,
    ...(experimental?.herdr === true ? ['herdr'] : []),
    ...(experimental?.herdrApp === true ? ['herdr-app'] : []),
  ];
}
export const deviceTemplate = { Model: '20GBL9901', UUID: '@(0)[]' };
export function actionId(index, backend) {
  const name = `com.kotl3r.deckshep/${backend}/key/${index}`;
  const bytes = createHash('sha1')
    .update(Buffer.from('6ba7b8119dad11d180b400c04fd430c8', 'hex'))
    .update(name)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 80;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export function profile(destination, device, backend, version) {
  if (!Object.hasOwn(PROFILE_IDS, backend))
    throw Error('Unknown controller profile');
  const id = PROFILE_IDS[backend],
    page = PAGE_IDS[backend],
    directory = path.join(destination, id + '.sdProfile'),
    pageDir = path.join(directory, 'Profiles', page);
  fs.mkdirSync(pageDir, { recursive: true });
  const write = (file, data) =>
    fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
  write(path.join(directory, 'manifest.json'), {
    Device: device,
    Name: PROFILE_NAMES[backend],
    Pages: {
      Current: page.toLowerCase(),
      Default: page.toLowerCase(),
      Pages: [page.toLowerCase()],
    },
    Version: '3.0',
  });
  const actions = {};
  for (let i = 0; i < 15; i++)
    actions[`${i % 5},${Math.floor(i / 5)}`] = {
      ActionID: actionId(i, backend),
      LinkedTitle: true,
      Name: 'DeckShep Key',
      Plugin: {
        Name: 'DeckShep',
        UUID: 'com.kotl3r.deckshep',
        Version: version,
      },
      Settings: { profileScope: backend },
      State: 0,
      States: [
        {
          Title: '',
          FontSize: 10,
          ShowTitle: false,
          TitleAlignment: 'middle',
          TitleColor: '#ffffff',
        },
      ],
      UUID: 'com.kotl3r.deckshep.key',
    };
  write(path.join(pageDir, 'manifest.json'), {
    Controllers: [{ Type: 'Keypad', Actions: actions }],
    Name: '',
    Icon: '',
  });
  return directory;
}
export function profileArchive(destination, backend, version) {
  const directory = profile(destination, deviceTemplate, backend, version);
  return zip(tree(directory, path.basename(directory) + '/'));
}
