import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { tree, zip } from './archive.mjs';
export const PROFILE_IDS = {
  rex: 'DCA673F9-ADDB-49C8-99BB-78B1D0BF20F2',
  herdr: '7150E562-B6DD-5FDC-B913-325149798069',
  'herdr-app': '6D19AEC8-CECA-53BD-A80B-82AE3A99B8FA',
};
export const PAGE_IDS = {
  rex: 'E8BFFB55-B717-4984-B8B1-CBC9BB7E5877',
  herdr: 'D571A142-0914-5750-8651-C825171B0630',
  'herdr-app': 'E7746240-85AC-5602-A4DC-769EC6F3E868',
};
export const PROFILE_NAMES = {
  rex: 'Rex Agents',
  herdr: 'Herdr Agents',
  'herdr-app': 'Herdr App Agents',
};
export const deviceTemplate = { Model: '20GBL9901', UUID: '@(0)[]' };
export function actionId(index, backend) {
  const name =
    backend === 'rex'
      ? `agent-switchboard/key/${index}`
      : `agent-switchboard/${backend}/key/${index}`;
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
      Name: 'Rex Agent Key',
      Plugin: {
        Name: 'Rex Agents',
        UUID: 'com.local.rexagents',
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
      UUID: 'com.local.rexagents.key',
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
