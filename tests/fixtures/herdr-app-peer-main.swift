import Darwin
import Foundation

@main
struct PeerFixture {
    static func main() throws {
        let file = CommandLine.arguments[1] + "/peer.sock"
        var address = sockaddr_un()
        address.sun_family = sa_family_t(AF_UNIX)
        address.sun_len = UInt8(MemoryLayout<sockaddr_un>.size)
        let name = Array(file.utf8CString).map { UInt8(bitPattern: $0) }
        guard name.count <= MemoryLayout.size(ofValue: address.sun_path) else { throw AppPeerError.unavailable }
        withUnsafeMutableBytes(of: &address.sun_path) { bytes in bytes.copyBytes(from: name) }
        let listener = socket(AF_UNIX, SOCK_STREAM, 0)
        let client = socket(AF_UNIX, SOCK_STREAM, 0)
        guard listener >= 0, client >= 0 else { throw AppPeerError.unavailable }
        defer { close(client); close(listener); unlink(file) }
        let length = socklen_t(MemoryLayout<sockaddr_un>.size)
        let bound = withUnsafePointer(to: &address) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { bind(listener, $0, length) }
        }
        guard bound == 0, chmod(file, 0o600) == 0, listen(listener, 1) == 0 else { throw AppPeerError.unavailable }
        let connected = withUnsafePointer(to: &address) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { connect(client, $0, length) }
        }
        guard connected == 0 else { throw AppPeerError.unavailable }
        var server = accept(listener, nil, nil)
        guard server >= 0 else { throw AppPeerError.unavailable }
        defer { if server >= 0 { close(server) } }
        // The peer is this fixture itself, never an existing app or agent.
        let result = try inspectAppPeer(client)
        guard result["pid"] as? Int32 == getpid(), result["uid"] as? UInt32 == getuid(),
              (try? inspectAppPeer(-1)) == nil else { throw AppPeerError.unavailable }
        if CommandLine.arguments.dropFirst(2).first == "closed-peer" {
            close(server)
            server = -1
            var byte: UInt8 = 0
            guard read(client, &byte, 1) == 0 else { throw AppPeerError.unavailable }
            let after = try? inspectAppPeer(client)
            let samePeer = after.map { NSDictionary(dictionary: $0).isEqual(to: result) } ?? false
            // Kernel credential retention after peer close varies by OS. Never infer
            // identity from the old request if a fresh descriptor query fails.
            let observation: [String: Any] = ["proof": after == nil ? "unavailable" : "retained", "samePeer": samePeer]
            FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject: observation, options: [.sortedKeys]))
            return
        }
        let bytes = try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])
        FileHandle.standardOutput.write(bytes)
    }
}
