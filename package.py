#!/usr/bin/env python3
"""Build a validated, local beta installer and profile; never publish or upload."""
from pathlib import Path
import hashlib,json,subprocess,sys,zipfile
ROOT=Path(__file__).resolve().parent
if __name__=='__main__':
    cli=ROOT/'tools/node_modules/.bin/streamdeck'
    if not cli.exists():raise SystemExit('Run npm ci --prefix tools first.')
    subprocess.run([sys.executable,str(ROOT/'build.py'),'--universal'],check=True)
    plugin=ROOT/'dist/com.local.rexagents.sdPlugin'
    subprocess.run([str(cli),'validate',str(plugin),'--no-update-check'],check=True)
    subprocess.run([str(cli),'pack',str(plugin),'--output',str(ROOT/'dist'),'--force','--no-update-check','--no-file-list'],check=True)
    package=ROOT/'dist/com.local.rexagents.streamDeckPlugin'
    if not package.is_file():raise SystemExit('Elgato CLI did not create the expected installer')
    # Audit the actual installer, not only the source directory.
    with zipfile.ZipFile(package) as archive:
        for entry in archive.infolist():
            parts=Path(entry.filename).parts
            if any(p in ('state','backups','.git','config.local.json','.env') or p.startswith('.env.') or p.endswith('.log') for p in parts):raise SystemExit('Private/development file in installer: '+entry.filename)
            if not entry.is_dir():
                data=archive.read(entry)
                if str(Path.home()).encode() in data or str(ROOT).encode() in data:raise SystemExit('Local home/workspace path in installer: '+entry.filename)
    manifest=json.loads((plugin/'manifest.json').read_text())
    files=[package,ROOT/'dist/Rex Agents.streamDeckProfile',ROOT/'README.md',ROOT/'docs/BETA-CHECKLIST.md',ROOT/'docs/COMPATIBILITY.md',ROOT/'docs/RELEASE-NOTES.md',ROOT/'docs/HERDR.md',ROOT/'THIRD-PARTY-NOTICES.md']
    def archive_name(file):return file.name if file.parent==ROOT/'dist' else file.relative_to(ROOT).as_posix()
    checksums=''.join(hashlib.sha256(file.read_bytes()).hexdigest()+'  '+archive_name(file)+'\n' for file in files)
    (ROOT/'dist/SHA256SUMS').write_text(checksums)
    with zipfile.ZipFile(ROOT/'dist/Agent Switchboard Local Beta.zip','w',zipfile.ZIP_DEFLATED) as archive:
        for file in [*files,ROOT/'dist/SHA256SUMS']:archive.write(file,archive_name(file))
    print('Local beta built:',manifest['Version'],'— no files uploaded')
