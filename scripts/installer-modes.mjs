import { zip, unzip } from './archive.mjs';

const executableFiles = ['visible-pane', 'herdr-app-peer'].map(
  (name) => 'com.kotl3r.deckshep.sdPlugin/bin/' + name,
);

/** Elgato's packer encodes every payload as 0644, including Mach-O helpers.
 * Preserve signed file bytes while explicitly recording Unix execute modes. */
export function preserveInstallerHelperModes(data) {
  const result = zip(unzip(data), { executableFiles });
  verifyInstallerHelperModes(result);
  return result;
}

export function verifyInstallerHelperModes(data) {
  const modes = new Map();
  unzip(data, { modes });
  for (const name of executableFiles)
    if (modes.get(name) !== 0o100755)
      throw Error('Installer helper must be executable');
}
