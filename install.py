#!/usr/bin/env python3
"""Install without changing existing profiles. Quit Stream Deck first."""
from pathlib import Path
import argparse,datetime,json,shutil,subprocess,sys
from build import profile
root=Path(__file__).resolve().parent
args=argparse.ArgumentParser(description=__doc__)
args.add_argument('--device-uuid',help='Choose a device UUID from an existing Stream Deck profile')
options=args.parse_args()
if sys.platform!='darwin':raise SystemExit('This installer supports macOS only.')
if subprocess.run(['pgrep','-f','Stream Deck.app/Contents/MacOS'],stdout=subprocess.DEVNULL).returncode==0:raise SystemExit('Quit Stream Deck first.')
base=Path.home()/'Library/Application Support/com.elgato.StreamDeck'
devices={}
for f in (base/'ProfilesV3').glob('*.sdProfile/manifest.json'):
    d=json.loads(f.read_text()).get('Device',{})
    if d.get('Model')=='20GBL9901' and d.get('UUID'):devices[d['UUID']]=d
if options.device_uuid:
    if options.device_uuid not in devices:raise SystemExit('Device not found in existing MK.2 profiles.')
    device=devices[options.device_uuid]
elif len(devices)==1:device=next(iter(devices.values()))
else:raise SystemExit('Need one existing MK.2 profile, or select --device-uuid. Available: '+', '.join(devices))
src=root/'dist/com.local.rexagents.sdPlugin'
if not (src/'node_modules/ws').exists():raise SystemExit('Run npm ci and python3 build.py first.')
backup=root/'backups'/datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f')
shutil.copytree(base/'ProfilesV3',backup/'ProfilesV3')
dest=base/'Plugins'/src.name
if dest.exists():shutil.copytree(dest,backup/'previous-plugin')
# Keep local prompt, alias, binding, and appearance customizations on upgrades.
config=json.loads((src/'config.json').read_text())
if (dest/'config.json').exists():
    old=json.loads((dest/'config.json').read_text())
    for k,v in old.items():
        if isinstance(v,dict) and isinstance(config.get(k),dict):config[k].update(v)
        else:config[k]=v
shutil.copytree(src,dest,dirs_exist_ok=True)
(dest/'config.json').write_text(json.dumps(config,indent=2)+'\n')
p=profile(root/'dist',device)
if not (base/'ProfilesV3'/p.name).exists():shutil.copytree(p,base/'ProfilesV3'/p.name)
print('Installed. Start Stream Deck and select Rex Agents. Backup:',backup)
