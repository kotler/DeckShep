#!/usr/bin/env python3
"""Build a portable plugin directory and generic 15-key Stream Deck profile."""
from pathlib import Path
import argparse,json,shutil,uuid,zipfile,subprocess,platform,sys,tempfile
ROOT=Path(__file__).resolve().parent
PROFILE='DCA673F9-ADDB-49C8-99BB-78B1D0BF20F2'
PAGE='E8BFFB55-B717-4984-B8B1-CBC9BB7E5877'
def profile(destination,device):
    root=destination/(PROFILE+'.sdProfile');page=root/'Profiles'/PAGE
    page.mkdir(parents=True,exist_ok=True)
    (root/'manifest.json').write_text(json.dumps({'Device':device,'Name':'Rex Agents','Pages':{'Current':PAGE.lower(),'Default':PAGE.lower(),'Pages':[PAGE.lower()]},'Version':'3.0'},indent=2))
    actions={}
    for i in range(15):
        actions[f'{i%5},{i//5}']={'ActionID':str(uuid.uuid5(uuid.NAMESPACE_URL,f'agent-switchboard/key/{i}')),'LinkedTitle':True,'Name':'Rex Agent Key','Plugin':{'Name':'Rex Agents','UUID':'com.local.rexagents','Version':'1.1.0.0'},'Settings':{},'State':0,'States':[{'Title':'','FontSize':10,'ShowTitle':False,'TitleAlignment':'middle','TitleColor':'#ffffff'}],'UUID':'com.local.rexagents.key'}
    (page/'manifest.json').write_text(json.dumps({'Controllers':[{'Type':'Keypad','Actions':actions}],'Name':'','Icon':''},indent=2))
    return root
if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--universal',action='store_true',help='Build the helper for Apple Silicon and Intel Macs')
    options=parser.parse_args()
    out=ROOT/'dist';out.mkdir(exist_ok=True)
    src=ROOT/'com.local.rexagents.sdPlugin'
    if not (src/'node_modules/ws').is_dir():raise SystemExit('Run npm ci --prefix com.local.rexagents.sdPlugin first.')
    if sys.platform!='darwin':raise SystemExit('The clipboard helper must be built on macOS.')
    (src/'bin').mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(dir=out,prefix='helper-build-') as temporary:
        binaries=[]
        for arch in (['arm64','x86_64'] if options.universal else [platform.machine()]):
            binary=Path(temporary)/arch;binaries.append(binary)
            subprocess.run(['swiftc','-O','-target',arch+'-apple-macosx13.0','-module-cache-path',str(out/'swift-cache'),str(ROOT/'native/visible-pane.swift'),'-o',str(binary)],check=True)
        if options.universal:
            subprocess.run(['lipo','-create',*[str(p) for p in binaries],'-output',str(src/'bin/visible-pane')],check=True)
            subprocess.run(['codesign','--force','--sign','-',str(src/'bin/visible-pane')],check=True)
        else:shutil.copy2(binaries[0],src/'bin/visible-pane')
    # Rebuild from a clean directory so an earlier local run cannot leak state.
    destination=out/src.name
    if destination.exists():shutil.rmtree(destination)
    shutil.copytree(src,destination,ignore=shutil.ignore_patterns('state','config.local.json','.env','.env.*','*.log','.DS_Store'))
    # Template only. Install binds a generated copy to a locally discovered device.
    p=profile(out,{'Model':'20GBL9901','UUID':'@(0)[]'})
    with zipfile.ZipFile(out/'Rex Agents.streamDeckProfile','w',zipfile.ZIP_DEFLATED) as z:
        for f in p.rglob('*'):
            if f.is_file():z.write(f,f.relative_to(out))
    print('Built dist/ plugin and generic profile')
