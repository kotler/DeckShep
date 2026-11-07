#!/usr/bin/env python3
"""Build or verify a versioned beta bundle. Never install, upload or publish."""
from pathlib import Path, PurePosixPath
import argparse
import hashlib
import io
import json
import re
import stat
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parent
PLUGIN = 'com.local.rexagents.sdPlugin'
INSTALLER = 'com.local.rexagents.streamDeckPlugin'
PROFILE = 'Rex Agents.streamDeckProfile'
DOCS = ('README.md', 'docs/INSTALL.md', 'docs/RELEASING.md', 'docs/UNINSTALL.md', 'docs/CLAUDE.md',
        'docs/BETA-CHECKLIST.md', 'docs/COMPATIBILITY.md',
        'docs/RELEASE-NOTES.md', 'docs/HERDR.md', 'THIRD-PARTY-NOTICES.md')
PAYLOAD = {INSTALLER, PROFILE, 'BUILD-INFO.json', *DOCS}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def audit_archive(archive):
    seen = set()
    for entry in archive.infolist():
        name = entry.filename
        parts = PurePosixPath(name).parts
        if (not parts or name.startswith('/') or '\\' in name or '..' in parts
                or name in seen or stat.S_ISLNK(entry.external_attr >> 16)):
            raise ValueError('Unsafe or duplicate archive entry: ' + name)
        seen.add(name)
        if any(p in ('state', 'backups', '.git', 'config.local.json', '.env', '.DS_Store')
               or p.startswith('.env.') or p.endswith('.log') for p in parts):
            raise ValueError('Private/development file in archive: ' + name)
        if not entry.is_dir():
            data = archive.read(entry)
            if any(str(p).encode() in data for p in (Path.home(), ROOT)):
                raise ValueError('Local home/workspace path in archive: ' + name)


def audit_installer(data):
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        audit_archive(archive)
        manifest = json.loads(archive.read(PLUGIN + '/manifest.json'))
        package = json.loads(archive.read(PLUGIN + '/package.json'))
        lock = json.loads(archive.read(PLUGIN + '/package-lock.json'))
        config = json.loads(archive.read(PLUGIN + '/config.json'))
        if (manifest['UUID'] != 'com.local.rexagents'
                or manifest['Version'] != package['version'] + '.0'
                or lock['version'] != package['version']
                or lock['packages']['']['version'] != package['version']):
            raise ValueError('Plugin identity/version mismatch')
        if (config.get('backend') != 'rex' or config.get('allowClipboardFocus') is not False
                or config.get('herdr') != {'socketPath': '', 'titleIdentity': False}
                or config.get('clientLabel') or config.get('aliases')
                or config.get('focusRoutingVerified')
                or config.get('claude', {}).get('enabled', False) is not False):
            raise ValueError('Package must use fresh Rex defaults with consent and title matching off')
        for required in ('bin/visible-pane', 'node_modules/ws/package.json',
                         'node_modules/@iarna/toml/package.json'):
            archive.getinfo(PLUGIN + '/' + required)
        return manifest


def audit_profile(data, version):
    from build import PROFILE as PROFILE_ID, PAGE
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        audit_archive(archive)
        prefix = PROFILE_ID + '.sdProfile/'
        profile = json.loads(archive.read(prefix + 'manifest.json'))
        page = json.loads(archive.read(prefix + 'Profiles/' + PAGE + '/manifest.json'))
        if profile['Device'] != {'Model': '20GBL9901', 'UUID': '@(0)[]'}:
            raise ValueError('Release profile must be an unbound MK.2 template')
        actions = page['Controllers'][0]['Actions']
        if set(actions) != {f'{i % 5},{i // 5}' for i in range(15)}:
            raise ValueError('Release profile must contain all 15 keys')
        for action in actions.values():
            if (action['Plugin']['UUID'] != 'com.local.rexagents'
                    or action['Plugin']['Version'] != version
                    or action['UUID'] != 'com.local.rexagents.key' or action['Settings']):
                raise ValueError('Profile action/version/default settings mismatch')


def verify_bundle(path):
    with zipfile.ZipFile(path) as archive:
        audit_archive(archive)
        if set(archive.namelist()) != PAYLOAD | {'SHA256SUMS'}:
            raise ValueError('Unexpected or missing bundle files')
        expected = {}
        for line in archive.read('SHA256SUMS').decode().splitlines():
            checksum, name = line.split('  ', 1)
            if not re.fullmatch(r'[a-f0-9]{64}', checksum) or name in expected:
                raise ValueError('Invalid or duplicate checksum entry')
            expected[name] = checksum
        if set(expected) != PAYLOAD:
            raise ValueError('Checksum list does not cover the complete bundle')
        for name, checksum in expected.items():
            if digest(archive.read(name)) != checksum:
                raise ValueError('Checksum mismatch: ' + name)
        manifest = audit_installer(archive.read(INSTALLER))
        audit_profile(archive.read(PROFILE), manifest['Version'])
        info = json.loads(archive.read('BUILD-INFO.json'))
        if (info['pluginVersion'] != manifest['Version']
                or info['packageVersion'] + '.0' != manifest['Version']
                or not re.fullmatch(r'[a-f0-9]{40}', info['gitCommit'])
                or type(info['workingTreeDirty']) is not bool
                or not re.fullmatch(r'v' + re.escape(info['packageVersion']) + r'-beta\.[1-9][0-9]*', info['tag'])):
            raise ValueError('Build provenance/version mismatch')
        return info


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--verify', type=Path, metavar='BUNDLE', help='Verify without building')
    parser.add_argument('--tag', help='Beta tag, e.g. v1.2.1-beta.1 (default: current version beta.1)')
    parser.add_argument('--require-clean', action='store_true', help='Refuse modified source trees')
    args = parser.parse_args()
    if args.verify:
        info = verify_bundle(args.verify)
        print('Verified:', args.verify, '\nSource:', info['gitCommit'], 'dirty:', info['workingTreeDirty'])
        return
    version = json.loads((ROOT / PLUGIN / 'package.json').read_text())['version']
    tag = args.tag or f'v{version}-beta.1'
    if not re.fullmatch(r'v' + re.escape(version) + r'-beta\.[1-9][0-9]*', tag):
        raise ValueError('Tag must match the package version: v' + version + '-beta.N')
    revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    dirty = bool(subprocess.check_output(['git', 'status', '--porcelain', '--untracked-files=normal'], cwd=ROOT, text=True))
    if args.require_clean and dirty:
        raise ValueError('Commit or remove source changes before a release build')
    cli = ROOT / 'tools/node_modules/.bin/streamdeck'
    if not cli.exists():
        raise ValueError('Run npm ci --prefix tools first')
    subprocess.run([sys.executable, str(ROOT / 'build.py'), '--universal'], check=True)
    out = ROOT / 'dist'
    plugin = out / PLUGIN
    subprocess.run([str(cli), 'validate', str(plugin), '--no-update-check'], check=True)
    subprocess.run([str(cli), 'pack', str(plugin), '--output', str(out), '--force',
                    '--no-update-check', '--no-file-list'], check=True)
    manifest = audit_installer((out / INSTALLER).read_bytes())
    audit_profile((out / PROFILE).read_bytes(), manifest['Version'])
    info = {'tag': tag, 'packageVersion': version, 'pluginVersion': manifest['Version'],
            'gitCommit': revision, 'workingTreeDirty': dirty, 'helperArchitectures': ['arm64', 'x86_64']}
    (out / 'BUILD-INFO.json').write_text(json.dumps(info, indent=2) + '\n')
    files = {name: (out / name if name in (INSTALLER, PROFILE, 'BUILD-INFO.json') else ROOT / name)
             for name in sorted(PAYLOAD)}
    checksums = ''.join(digest(file.read_bytes()) + '  ' + name + '\n' for name, file in files.items())
    (out / 'SHA256SUMS').write_text(checksums)
    bundle = out / f'agent-switchboard-{tag[1:]}-macos.zip'
    with zipfile.ZipFile(bundle, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name, file in files.items():
            archive.write(file, name)
        archive.writestr('SHA256SUMS', checksums)
    verify_bundle(bundle)
    checksum_file = bundle.with_name(bundle.name + '.sha256')
    checksum_file.write_text(digest(bundle.read_bytes()) + '  ' + bundle.name + '\n')
    print('Built and verified:', bundle, '\nOuter checksum:', checksum_file, '\nNo files uploaded.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, OSError, zipfile.BadZipFile, subprocess.CalledProcessError) as exc:
        raise SystemExit(str(exc)) from exc
