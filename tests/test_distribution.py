"""Archive and installer regression checks; no installed files or agents touched."""
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
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
        for replacement in ({'allowClipboardFocus': True}, {'backend': 'herdr'},
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
            generated = build.profile(root, {'Model': '20GBL9901', 'UUID': '@(0)[]'})
            def data():
                return zipped({p.relative_to(root).as_posix(): p.read_bytes()
                               for p in generated.rglob('*') if p.is_file()})
            package.audit_profile(data(), version)
            with self.assertRaises(ValueError):
                package.audit_profile(data(), '0.0.0.0')
            build.profile(root, {'Model': '20GBL9901', 'UUID': 'PRIVATE_DEVICE'})
            with self.assertRaises(ValueError):
                package.audit_profile(data(), version)

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
