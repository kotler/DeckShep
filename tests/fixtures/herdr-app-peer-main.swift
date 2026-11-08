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
        let server = accept(listener, nil, nil)
        guard server >= 0 else { throw AppPeerError.unavailable }
        defer { close(server) }
        // The peer is this fixture itself, never an existing app or agent.
        let result = try inspectAppPeer(client)
        guard result["pid"] as? Int32 == getpid(), result["uid"] as? UInt32 == getuid(),
              (try? inspectAppPeer(-1)) == nil else { throw AppPeerError.unavailable }
        let bytes = try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])
        FileHandle.standardOutput.write(bytes)
    }
}
