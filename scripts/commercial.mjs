import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const required = [
  'nameAndLogo',
  'openaiMarks',
  'anthropicMarks',
  'customerTerms',
  'launchValidation',
];

function hasEvidence(directory, name) {
  if (typeof name !== 'string' || !name || path.isAbsolute(name)) return false;
  const absolute = path.resolve(fs.realpathSync(directory), name);
  if (!absolute.startsWith(fs.realpathSync(directory) + path.sep)) return false;
  try {
    return (
      fs.realpathSync(absolute) === absolute &&
      fs.lstatSync(absolute).isFile() &&
      fs.statSync(absolute).size > 0
    );
  } catch {
    return false;
  }
}

export function commercialFailures(directory = root) {
  const read = (name) =>
    JSON.parse(fs.readFileSync(path.join(directory, name)));
  const record = read('commercial/release.json'),
    pkg = read('package.json');
  const failures = [];
  if (
    record.product !== 'DeckShep' ||
    record.version !== pkg.version ||
    record.seller !== 'Everett Kotler'
  )
    failures.push('Release review must match this product, seller and version');
  for (const name of required) {
    const review = record.reviews?.[name];
    if (
      review?.approved !== true ||
      !/^\d{4}-\d{2}-\d{2}$/.test(review?.reviewedAt || '') ||
      !hasEvidence(directory, review?.evidence)
    )
      failures.push('Documented review pending: ' + name);
  }
  const assets = Array.isArray(record.assets) ? record.assets : [];
  const expected = [
    'assets/plugin-icon-source.svg',
    'action-icon.svg',
    'icon.png',
    'icon@2x.png',
    'assets/codex-app.png',
    'assets/codex-mark.png',
    'assets/claude-mark.svg',
  ];
  if (
    !Array.isArray(assets) ||
    assets.length !== expected.length ||
    expected.some((name) => !assets.some((asset) => asset.path === name))
  )
    failures.push('Artwork review inventory incomplete');
  for (const name of expected) {
    const asset = assets?.find((entry) => entry.path === name);
    const file = path.join(directory, 'com.local.rexagents.sdPlugin', name);
    if (
      !fs.existsSync(file) ||
      createHash('sha256').update(fs.readFileSync(file)).digest('hex') !==
        asset?.sha256
    )
      failures.push('Artwork changed since review: ' + name);
  }
  const contact = record.support?.contact || '';
  if (
    record.support?.verified !== true ||
    !hasEvidence(directory, record.support?.evidence) ||
    !(
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) ||
      /^https:\/\/[^\s/]+\.[^\s/]+(?:\/[^\s]*)?$/.test(contact)
    )
  )
    failures.push('Verified public support contact pending');
  return failures;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const failures = commercialFailures();
  if (failures.length) {
    console.error(
      'DeckShep remains private review only:\n' +
        failures.map((reason) => '- ' + reason).join('\n'),
    );
    process.exitCode = 1;
  } else
    console.log(
      'Release evidence recorded. Confirm that its legal scope and launch claims remain accurate before publication.',
    );
}
