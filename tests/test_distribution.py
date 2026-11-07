"""Archive and installer regression checks; no installed files or agents touched."""
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import zipfile

import build
import install
import package


def zipped(files):
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, 'w') as archive:
        for name, data in files.items():
            archive.writestr(name, data)
    return stream.getvalue()


class DistributionTests(unittest.TestCase):
    def test_archive_rejects_private_paths_and_home_data(self):
        for name, data in [('x/state/cache.json', '{}'), ('x/.env.local', 'secret'),
                           ('../outside', ''), ('/absolute', ''), ('x/debug.log', ''),
                           ('README.md', str(Path.home()))]:
            with self.subTest(name=name), zipfile.ZipFile(io.BytesIO(zipped({name: data}))) as archive:
                with self.assertRaises(ValueError):
                    package.audit_archive(archive)

    def test_installer_requires_safe_defaults_and_consistent_versions(self):
        prefix = package.PLUGIN + '/'
        files = {prefix + 'manifest.json': json.dumps({'UUID': 'com.local.rexagents', 'Version': '1.2.1.0'}),
                 prefix + 'package.json': json.dumps({'version': '1.2.1'}),
                 prefix + 'package-lock.json': json.dumps({'version': '1.2.1', 'packages': {'': {'version': '1.2.1'}}}),
                 prefix + 'config.json': json.dumps({'backend': 'rex', 'allowClipboardFocus': False,
                                                    'herdr': {'socketPath': '', 'titleIdentity': False}}),
                 prefix + 'bin/visible-pane': b'helper',
                 prefix + 'node_modules/ws/package.json': '{}',
                 prefix + 'node_modules/@iarna/toml/package.json': '{}'}
        self.assertEqual(package.audit_installer(zipped(files))['Version'], '1.2.1.0')
        for replacement in ({'allowClipboardFocus': True}, {'backend': 'herdr'}, {'claude': {'enabled': True}},
                            {'herdr': {'socketPath': '/tmp/private.sock', 'titleIdentity': True}}):
            config = {'backend': 'rex', 'allowClipboardFocus': False,
                      'herdr': {'socketPath': '', 'titleIdentity': False}, **replacement}
            with self.subTest(replacement=replacement), self.assertRaises(ValueError):
                package.audit_installer(zipped({**files, prefix + 'config.json': json.dumps(config)}))
        with self.assertRaises(ValueError):
            package.audit_installer(zipped({**files, prefix + 'package.json': '{"version":"1.2.0"}'}))

    def test_generic_profile_version_and_device_binding(self):
        version = json.loads((build.ROOT / package.PLUGIN / 'manifest.json').read_text())['Version']
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            identities = []
            for backend in ('rex', 'herdr'):
                generated = build.profile(root, {'Model': '20GBL9901', 'UUID': '@(0)[]'}, backend)
                def data():
                    return zipped({p.relative_to(root).as_posix(): p.read_bytes()
                                   for p in generated.rglob('*') if p.is_file()})
                package.audit_profile(data(), version, backend)
                with self.assertRaises(ValueError):
                    package.audit_profile(data(), '0.0.0.0', backend)
                with self.assertRaises((ValueError, KeyError)):
                    package.audit_profile(data(), version, 'herdr' if backend == 'rex' else 'rex')
                page = generated / 'Profiles' / build.PAGE_IDS[backend] / 'manifest.json'
                content = json.loads(page.read_text())
                identities.extend(a['ActionID'] for a in content['Controllers'][0]['Actions'].values())
                content['Controllers'][0]['Actions']['0,0']['Settings']['profileScope'] = 'wrong'
                page.write_text(json.dumps(content))
                with self.assertRaises(ValueError):
                    package.audit_profile(data(), version, backend)
                build.profile(root, {'Model': '20GBL9901', 'UUID': 'PRIVATE_DEVICE'}, backend)
                with self.assertRaises(ValueError):
                    package.audit_profile(data(), version, backend)
            self.assertEqual(len(set(identities)), 30)

    def test_installer_adds_herdr_without_overwriting_existing_rex(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            task = root / 'checkout'
            src = task / 'dist' / package.PLUGIN
            for name in ('manifest.json', 'bin/visible-pane', 'node_modules/ws/package.json',
                         'node_modules/@iarna/toml/package.json'):
                file = src / name
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_text('{}')
            (src / 'config.json').write_text(json.dumps({'allowClipboardFocus': False,
                                                       'prompts': {'review': 'default', 'tests': 'test'}}))
            home = root / 'home'
            base = home / 'Library/Application Support/com.elgato.StreamDeck'
            profiles = base / 'ProfilesV3'
            profiles.mkdir(parents=True)
            existing = build.profile(profiles, {'Model': '20GBL9901', 'UUID': 'device'})
            page = existing / 'Profiles' / build.PAGE / 'manifest.json'
            page.write_text('{"customized": "preserve this exactly"}')
            before = {p.relative_to(existing): p.read_bytes() for p in existing.rglob('*') if p.is_file()}
            dest = base / 'Plugins' / package.PLUGIN
            dest.mkdir(parents=True)
            (dest / 'config.json').write_text(json.dumps({'allowClipboardFocus': True,
                                                        'prompts': {'review': 'custom'}}))
            with patch.object(install, 'ROOT', task), patch.object(install.Path, 'home', return_value=home), \
                    patch.object(install.sys, 'argv', ['install.py']), \
                    patch.object(install.subprocess, 'run', return_value=subprocess.CompletedProcess([], 1)):
                install.main()
            after = {p.relative_to(existing): p.read_bytes() for p in existing.rglob('*') if p.is_file()}
            self.assertEqual(before, after)
            herdr = profiles / (build.PROFILE_IDS['herdr'] + '.sdProfile')
            self.assertEqual(json.loads((herdr / 'manifest.json').read_text())['Name'], 'Herdr Agents')
            actions = json.loads((herdr / 'Profiles' / build.PAGE_IDS['herdr'] / 'manifest.json').read_text())['Controllers'][0]['Actions']
            self.assertTrue(all(a['Settings'] == {'profileScope': 'herdr'} for a in actions.values()))
            config = json.loads((dest / 'config.json').read_text())
            self.assertTrue(config['allowClipboardFocus'])
            self.assertEqual(config['prompts'], {'review': 'custom', 'tests': 'test'})
            self.assertEqual(len(list((task / 'backups').iterdir())), 1)

    def test_bundle_rejects_missing_files_and_modified_checksums(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / 'bundle.zip'
            path.write_bytes(zipped({'SHA256SUMS': ''}))
            with self.assertRaises(ValueError):
                package.verify_bundle(path)
            files = {name: b'fixture' for name in package.PAYLOAD}
            sums = ''.join(package.digest(data) + '  ' + name + '\n' for name, data in files.items())
            path.write_bytes(zipped({**files, 'README.md': b'changed', 'SHA256SUMS': sums}))
            with self.assertRaisesRegex(ValueError, 'Checksum mismatch'):
                package.verify_bundle(path)

    def test_unknown_stream_deck_process_state_blocks_install(self):
        install.require_stopped(subprocess.CompletedProcess([], 1))
        for code in (0, 2, 3, -1):
            with self.subTest(code=code), self.assertRaises(ValueError):
                install.require_stopped(subprocess.CompletedProcess([], code))

    def test_upgrade_preserves_local_preferences_and_adds_defaults(self):
        defaults = {'allowClipboardFocus': False, 'herdr': {'socketPath': '', 'titleIdentity': False},
                    'prompts': {'review': 'default', 'tests': 'test'}}
        old = {'allowClipboardFocus': True, 'herdr': {'socketPath': '/tmp/local.sock'},
               'prompts': {'review': 'custom'}, 'focusRoutingVerified': True}
        result = install.merged_config(defaults, old)
        self.assertTrue(result['allowClipboardFocus'])
        self.assertEqual(result['herdr'], {'socketPath': '/tmp/local.sock', 'titleIdentity': False})
        self.assertEqual(result['prompts'], {'review': 'custom', 'tests': 'test'})
        self.assertNotIn('focusRoutingVerified', result)
        self.assertFalse(defaults['allowClipboardFocus'])
        self.assertFalse(install.merged_config(defaults, {})['allowClipboardFocus'])

    def test_device_choice_refuses_missing_or_ambiguous_targets(self):
        devices = {'A': {'UUID': 'A'}, 'B': {'UUID': 'B'}}
        self.assertEqual(install.select_device({'A': devices['A']}), devices['A'])
        self.assertEqual(install.select_device(devices, 'B'), devices['B'])
        for candidates, choice in (({}, None), (devices, None), (devices, 'C')):
            with self.subTest(choice=choice), self.assertRaises(ValueError):
                install.select_device(candidates, choice)


if __name__ == '__main__':
    unittest.main()
