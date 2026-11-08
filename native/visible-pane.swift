import AppKit
import Foundation
import Darwin

// Never print clipboard data or Rex action output. Only a validated block ID leaves this process.
func fail(_ message: String) -> Never { FileHandle.standardError.write(Data((message+"\n").utf8)); exit(1) }
let argv=CommandLine.arguments
if argv.count != 3 { fail("Expected Rex executable and client ID") }
let rex=argv[1], client=argv[2]
if !client.hasPrefix("client:") { fail("Invalid Rex client") }
// Keep this shared mutex compatible with older preview helpers.
let lockPath=NSTemporaryDirectory()+"agent-switchboard-clipboard-\(getuid()).lock"
let lockFD=open(lockPath,O_CREAT|O_RDWR|O_NOFOLLOW,mode_t(0o600))
if lockFD < 0 || flock(lockFD,LOCK_EX|LOCK_NB) != 0 { fail("Focus query already running") }
defer { flock(lockFD,LOCK_UN);close(lockFD) }
let pb=NSPasteboard.general
let before=pb.changeCount
var saved:[[NSPasteboard.PasteboardType:Data]]=[]
for item in pb.pasteboardItems ?? [] {
    var data:[NSPasteboard.PasteboardType:Data]=[:]
    for type in item.types {
        guard let value=item.data(forType:type) else { fail("Clipboard cannot be safely preserved") }
        data[type]=value
    }
    saved.append(data)
}
if pb.changeCount != before { fail("Clipboard changed during snapshot") }
let p=Process();p.executableURL=URL(fileURLWithPath:rex)
p.arguments=["--autostart=false","--timeout","2s","-C",client,"do","pane.copy_id","--json"]
var env=ProcessInfo.processInfo.environment
for key in ["REX_SESSION","REX_BLOCK","REX_CLIENT"] { env.removeValue(forKey:key) }
p.environment=env;p.standardOutput=FileHandle.nullDevice;p.standardError=FileHandle.nullDevice
do { try p.run() } catch { fail("Could not run Rex focus query") }
let deadline=Date().addingTimeInterval(3)
while p.isRunning && Date() < deadline { Thread.sleep(forTimeInterval:0.01) }
if p.isRunning { p.terminate();fail("Rex focus query timed out") }
p.waitUntilExit()
let copiedCount=pb.changeCount
let id=pb.string(forType:.string) ?? ""
let valid=id.range(of:"^block:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",options:.regularExpression) != nil
if valid && copiedCount != before {
    // Compare-and-restore: never overwrite a clipboard change made by another app.
    if pb.changeCount != copiedCount { fail("Clipboard changed before restore") }
    pb.clearContents()
    let items=saved.map { record -> NSPasteboardItem in
        let item=NSPasteboardItem()
        for (type,data) in record { item.setData(data,forType:type) }
        return item
    }
    if !items.isEmpty && !pb.writeObjects(items) { fail("Clipboard restore failed") }
} else { fail("Rex did not return a fresh pane ID; clipboard left untouched") }
if p.terminationStatus != 0 { fail("Rex refused focus query") }
var restored:[[NSPasteboard.PasteboardType:Data]]=[]
for item in pb.pasteboardItems ?? [] {
    var data:[NSPasteboard.PasteboardType:Data]=[:]
    for type in item.types { guard let value=item.data(forType:type) else { fail("Clipboard verification failed") };data[type]=value }
    restored.append(data)
}
if restored != saved { fail("Clipboard restoration verification failed") }
let result=try JSONSerialization.data(withJSONObject:["block_id":id,"clipboard_restored":true],options:[.sortedKeys])
FileHandle.standardOutput.write(result)
