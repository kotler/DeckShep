import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const providerFiles = {
  'codex-mark.svg': 'packages/static-svg/icons/codex.svg',
  'claude-mark.svg': 'packages/static-svg/icons/claude.svg',
  'lobehub-LICENSE.txt': 'LICENSE',
};
function hasEvidence(directory, name) {
  if (typeof name !== 'string' || !name || path.isAbsolute(name)) return false;
  const base = fs.realpathSync(directory),
    absolute = path.resolve(base, name);
  if (!absolute.startsWith(base + path.sep)) return false;
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
function hash(directory, name) {
  return hasEvidence(directory, name)
    ? createHash('sha256')
        .update(fs.readFileSync(path.join(directory, name)))
        .digest('hex')
    : null;
}
function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const date = new Date(value + 'T00:00:00Z');
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
function reviewed(directory, item) {
  return (
    item?.ownerVerified === true &&
    validDate(item.reviewedAt) &&
    hasEvidence(directory, item.evidence)
  );
}
function providerProvenanceValid(directory, record) {
  try {
    const name = 'com.kotl3r.deckshep.sdPlugin/assets/lobehub-PROVENANCE.json';
    if (
      hash(directory, name) !== record?.provenanceSha256 ||
      record?.trademarkPermission !== 'pending'
    )
      return false;
    const info = JSON.parse(fs.readFileSync(path.join(directory, name)));
    return (
      info.repository === 'https://github.com/lobehub/lobe-icons' &&
      /^[a-f0-9]{40}$/.test(info.revision) &&
      info.revision === record.revision &&
      info.trademarkPermission === 'pending' &&
      info.files?.length === 3 &&
      Object.entries(providerFiles).every(([file, sourcePath]) => {
        const item = info.files.find((entry) => entry.path === file);
        return (
          item?.sourcePath === sourcePath &&
          item?.sha256 ===
            hash(directory, 'com.kotl3r.deckshep.sdPlugin/assets/' + file)
        );
      })
    );
  } catch {
    return false;
  }
}
function issuesUrl(value) {
  const match =
    /^https:\/\/github\.com\/([A-Za-z0-9][A-Za-z0-9_.-]*)\/([A-Za-z0-9][A-Za-z0-9_.-]*)\/issues$/.exec(
      value || '',
    );
  const placeholders = [
    'OWNER',
    'REPOSITORY',
    'YOUR-ORG',
    'YOUR-REPO',
    'PLACEHOLDER',
  ];
  return (
    !!match &&
    !match.slice(1).some((part) => placeholders.includes(part.toUpperCase()))
  );
}
export function releaseReadinessFailures(directory = root) {
  let record, pkg;
  try {
    record = JSON.parse(
      fs.readFileSync(path.join(directory, 'release/readiness.json')),
    );
    pkg = JSON.parse(fs.readFileSync(path.join(directory, 'package.json')));
  } catch {
    return ['Release metadata unavailable or invalid'];
  }
  const failures = [];
  if (record.product !== 'DeckShep' || record.version !== pkg.version)
    failures.push('Release record must match this product and exact version');
  if (
    pkg.license !== 'Apache-2.0' ||
    record.license?.spdx !== 'Apache-2.0' ||
    hash(directory, 'LICENSE') !== record.license?.sha256 ||
    !hasEvidence(directory, 'NOTICE') ||
    !hasEvidence(directory, 'TRADEMARKS.md')
  )
    failures.push('Apache-2.0 license hash or required notices invalid');
  if (!providerProvenanceValid(directory, record.providerMarks))
    failures.push(
      'Pinned LobeHub provenance, hashes or pending trademark statement invalid',
    );
  const validation = record.launchValidation;
  if (validation?.version !== pkg.version || !reviewed(directory, validation))
    failures.push('Version-specific launch-validation review pending');
  if (
    !issuesUrl(record.support?.issues?.url) ||
    !reviewed(directory, record.support?.issues)
  )
    failures.push('Owner-verified public GitHub Issues channel pending');
  return failures;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const failures = releaseReadinessFailures();
  if (failures.length) {
    console.error(
      'DeckShep release remains pending:\n' +
        failures.map((reason) => '- ' + reason).join('\n'),
    );
    process.exitCode = 1;
  } else
    console.log(
      'Version-specific release evidence is recorded. Provider trademark permission is still stated as pending; publication remains an owner action.',
    );
}
