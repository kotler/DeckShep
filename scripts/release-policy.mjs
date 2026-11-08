export function releasePolicy(
  version,
  { tag, release = false, dirty = false } = {},
) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw Error('Invalid package version');
  const base = 'v' + version;
  const beta = new RegExp(
    '^' + base.replaceAll('.', '\\.') + '-beta\\.[1-9][0-9]*$',
  );
  const value = tag || (release ? base : base + '-beta.1');
  if (!(beta.test(value) || (release && value === base)))
    throw Error(
      release
        ? 'Tag must match the package version'
        : 'Stable tags require --release and approved release evidence',
    );
  if (release && dirty)
    throw Error('Public-release packaging requires a clean source commit');
  return {
    tag: value,
    distribution: release ? 'public-release' : 'private-review',
  };
}

export function validProvenanceTag(info) {
  const distribution = info.distribution || 'private-review';
  if (!['private-review', 'public-release'].includes(distribution))
    return false;
  try {
    return (
      releasePolicy(info.packageVersion, {
        tag: info.tag,
        release: distribution === 'public-release',
        dirty: info.workingTreeDirty,
      }).tag === info.tag
    );
  } catch {
    return false;
  }
}
