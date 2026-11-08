import Darwin
import Foundation

@main
struct AppPeerMain {
    static func main() {
        do {
            // Descriptor 3 is inherited from the caller's connected socket.
            // No connect, application launch, input, clipboard or socket read/write.
            guard CommandLine.arguments.count == 1 else { throw AppPeerError.unavailable }
            let result = try inspectAppPeer(3)
            let bytes = try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])
            FileHandle.standardOutput.write(bytes)
        } catch {
            FileHandle.standardError.write(Data("Peer unverified\n".utf8))
            exit(1)
        }
    }
}
