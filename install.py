#!/usr/bin/env python3
"""Install a local build with backups. Quit Stream Deck first; leave agents running."""
from pathlib import Path
import argparse
import datetime
import json
import shutil
import subprocess
import sys
from build import profile

ROOT = Path(__file__).resolve().parent


def require_stopped(result):
    if result.returncode == 0:
        raise ValueError('Quit Stream Deck first. Leave Rex, Herdr and your agents running.')
    if result.returncode != 1:
        raise ValueError('Could not verify that Stream Deck is stopped; no installation performed.')


def select_device(devices, device_uuid=None):
    if device_uuid:
        if device_uuid not in devices:
            raise ValueError('Device not found in existing MK.2 profiles.')
        return devices[device_uuid]
    if len(devices) == 1:
        return next(iter(devices.values()))
    raise ValueError('Need one existing MK.2 profile, or select --device-uuid. Available: '
                     + (', '.join(sorted(devices)) or 'none; create a normal MK.2 profile in Stream Deck first'))


def merged_config(defaults, old):
    # Preserve custom prompts, aliases and explicit local consent; add new defaults.
    config = json.loads(json.dumps(defaults))
    for key, value in old.items():
        if isinstance(value, dict) and isinstance(config.get(key), dict):
            config[key].update(value)
        else:
            config[key] = value
    config.pop('focusRoutingVerified', None)
    return config


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--device-uuid', help='Choose a device UUID from an existing MK.2 profile')
    options = parser.parse_args()
    if sys.platform != 'darwin':
        raise ValueError('This installer supports macOS only.')
    require_stopped(subprocess.run(['pgrep', '-f', 'Stream Deck.app/Contents/MacOS'],
                                  stdout=subprocess.DEVNULL))
    base = Path.home() / 'Library/Application Support/com.elgato.StreamDeck'
    devices = {}
    for file in (base / 'ProfilesV3').glob('*.sdProfile/manifest.json'):
        device = json.loads(file.read_text()).get('Device', {})
        if device.get('Model') == '20GBL9901' and device.get('UUID'):
            devices[device['UUID']] = device
    device = select_device(devices, options.device_uuid)
    src = ROOT / 'dist/com.local.rexagents.sdPlugin'
    if not all((src / path).is_file() for path in ('manifest.json', 'bin/visible-pane',
                 'node_modules/ws/package.json', 'node_modules/@iarna/toml/package.json')):
        raise ValueError('Run npm ci --prefix com.local.rexagents.sdPlugin and python3 build.py first.')
    dest = base / 'Plugins' / src.name
    defaults = json.loads((src / 'config.json').read_text())
    old = json.loads((dest / 'config.json').read_text()) if (dest / 'config.json').exists() else {}
    config = merged_config(defaults, old)
    backup = ROOT / 'backups' / datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f')
    shutil.copytree(base / 'ProfilesV3', backup / 'ProfilesV3')
    if dest.exists():
        shutil.copytree(dest, backup / 'previous-plugin')
    # Report the recovery location before the first installed-file mutation.
    print('Backup:', backup, flush=True)
    shutil.copytree(src, dest, dirs_exist_ok=True)
    (dest / 'config.json').write_text(json.dumps(config, indent=2) + '\n')
    generated = profile(ROOT / 'dist', device)
    target = base / 'ProfilesV3' / generated.name
    if not target.exists():
        shutil.copytree(generated, target)
    print('Installed. Start Stream Deck and select Rex Agents. Existing agents were not restarted.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, KeyError) as exc:
        raise SystemExit(str(exc)) from exc
