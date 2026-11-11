import CryptoKit
import Darwin
import Foundation

enum HookProcessError: Error { case unavailable }

func processFact(_ pid: Int32) throws -> (proc_bsdinfo, String) {
    var info = proc_bsdinfo()
    let size = Int32(MemoryLayout<proc_bsdinfo>.size)
    guard pid > 1,
          proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, &info, size) == size,
          info.pbi_pid == UInt32(pid), info.pbi_uid == getuid(),
          info.pbi_ruid == getuid() else { throw HookProcessError.unavailable }
    var buffer = [CChar](repeating: 0, count: 4 * Int(MAXPATHLEN))
    guard proc_pidpath(pid, &buffer, UInt32(buffer.count)) > 0 else {
        throw HookProcessError.unavailable
    }
    return (info, String(cString: buffer))
}

func inspectHookProcess(_ pid: Int32) throws -> [String: Any] {
    let (before, image) = try processFact(pid)
    let (after, currentImage) = try processFact(pid)
    guard before.pbi_ppid == after.pbi_ppid,
          before.pbi_start_tvsec == after.pbi_start_tvsec,
          before.pbi_start_tvusec == after.pbi_start_tvusec,
          image == currentImage else { throw HookProcessError.unavailable }
    let hash = SHA256.hash(data: Data(image.utf8)).map { String(format: "%02x", $0) }.joined()
    return [
        "pid": Int(pid), "parent": Int(before.pbi_ppid),
        "startedAt": "\(before.pbi_start_tvsec).\(String(format: "%06llu", before.pbi_start_tvusec))",
        "image": hash, "codex": URL(fileURLWithPath: image).lastPathComponent == "codex",
    ]
}

do {
    guard CommandLine.arguments.count == 2,
          let pid = CommandLine.arguments[1] == "--self" ? getpid() : Int32(CommandLine.arguments[1])
    else { throw HookProcessError.unavailable }
    let data = try JSONSerialization.data(withJSONObject: inspectHookProcess(pid), options: [.sortedKeys])
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data([10]))
} catch {
    FileHandle.standardError.write(Data("Codex process unavailable\n".utf8))
    exit(1)
}
