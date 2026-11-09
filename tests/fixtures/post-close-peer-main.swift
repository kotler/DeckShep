import Darwin
import Foundation

@main
struct PostCloseFixture {
    static func main() {
        do {
            let arguments = CommandLine.arguments
            let result: [String: Any]
            switch arguments.dropFirst().first {
            case "ipc":
                let pair = try FixtureSocketPair(arguments[2] + "/ipc.sock")
                guard dup2(pair.client, 3) == 3 else { throw AppPeerError.unavailable }
                try withExtendedLifetime(pair) { try runAppPeerSession() }
                return
            case "after-self-exec": result = try afterExec()
            case "self-exec": try selfExec(arguments[2]); return
            case "close": result = try closedPeer(arguments[2])
            case "expiry": result = try expired(arguments[2])
            case "fd-reuse": result = try reusedDescriptor(arguments[2])
            default: throw AppPeerError.unavailable
            }
            FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys]))
        } catch {
            FileHandle.standardError.write(Data("Post-close fixture refused\n".utf8))
            exit(1)
        }
    }

    static func rejected(_ action: () throws -> Void) -> Bool {
        do { try action(); return false } catch { return true }
    }

    static func closedPeer(_ directory: String) throws -> [String: Any] {
        let pair = try FixtureSocketPair(directory + "/closed.sock")
        let lease = try FixturePostCloseLease(pair.client, now: { 1 })
        let production = try AppPeerSession(pair.client)
        try lease.beforeWrite()
        _ = try production.check()
        try pair.replyAndClose()
        let retainedByKernel = (try? fixtureToken(pair.client)) != nil
        try lease.finish()
        let (_, productionToken) = try production.finish()
        guard ["matched", "unavailable"].contains(productionToken),
              rejected({ _ = try production.finish() }) else { throw AppPeerError.unavailable }
        guard rejected({ try lease.finish() }),
              rejected({ _ = try FixturePostCloseLease(pair.client, now: { 1 }) }) else { throw AppPeerError.unavailable }
        return ["scenario": "close", "kernelRetained": retainedByKernel,
            "retainedImageValidated": true, "replayRefused": true, "lateCaptureRefused": true]
    }

    static func expired(_ directory: String) throws -> [String: Any] {
        let pair = try FixtureSocketPair(directory + "/expiry.sock")
        var now: UInt64 = 1
        let lease = try FixturePostCloseLease(pair.client, now: { now })
        try lease.beforeWrite()
        now += 1_000_000_000
        guard rejected({ try lease.finish() }), rejected({ try lease.beforeWrite() }) else { throw AppPeerError.unavailable }
        var forged = try fixtureToken(pair.client)
        forged.val.7 &+= 1
        guard rejected({ _ = try fixtureImage(forged) }) else { throw AppPeerError.unavailable }
        return ["scenario": "expiry", "expiredRefused": true, "changedVersionRefused": true]
    }

    static func reusedDescriptor(_ directory: String) throws -> [String: Any] {
        let original = try FixtureSocketPair(directory + "/original.sock")
        let replacement = try FixtureSocketPair(directory + "/replacement.sock")
        let lease = try FixturePostCloseLease(original.client, now: { 1 })
        try lease.beforeWrite()
        // The helper's duplicate remains on the original connection. Socket-
        // object/endpoint rebinding is independently refused by the JS contract.
        guard dup2(replacement.client, original.client) == original.client else { throw AppPeerError.unavailable }
        original.closeServer()
        guard lease.fixtureSeesPeerClose() else { throw AppPeerError.unavailable }
        try fixtureConnected(original.client)
        try lease.finish()
        return ["scenario": "fd-reuse", "originalLeaseRevalidated": true,
            "pinnedOriginalClosed": true, "replacementStillConnected": true]
    }

    static func selfExec(_ directory: String) throws {
        let pair = try FixtureSocketPair(directory + "/exec.sock")
        let token = try fixtureToken(pair.client)
        _ = try fixtureImage(token)
        var descriptors: [Int32] = [0, 0]
        guard pipe(&descriptors) == 0 else { throw AppPeerError.unavailable }
        // Only this fixture's self-exec uses a private anonymous pipe. No token
        // enters argv, environment, files, logs or the proposed parent protocol.
        let readFD: Int32 = 198
        guard dup2(descriptors[0], readFD) == readFD else { throw AppPeerError.unavailable }
        close(descriptors[0])
        let count = withUnsafeBytes(of: token) { write(descriptors[1], $0.baseAddress, $0.count) }
        close(descriptors[1])
        guard count == MemoryLayout<audit_token_t>.size else { throw AppPeerError.unavailable }
        let executable = CommandLine.arguments[0]
        let values = [executable, "after-self-exec", directory].map { strdup($0) }
        defer { for value in values { free(value) } }
        var pointers = values + [nil]
        _ = pointers.withUnsafeMutableBufferPointer { execv(executable, $0.baseAddress!) }
        throw AppPeerError.unavailable
    }

    static func afterExec() throws -> [String: Any] {
        var token = audit_token_t()
        let count = withUnsafeMutableBytes(of: &token) { read(198, $0.baseAddress, $0.count) }
        close(198)
        guard count == MemoryLayout<audit_token_t>.size,
              audit_token_to_pid(token) == getpid(),
              rejected({ _ = try fixtureImage(token) }) else { throw AppPeerError.unavailable }
        let pair = try FixtureSocketPair(CommandLine.arguments[2] + "/fresh.sock")
        let fresh = try fixtureToken(pair.client)
        guard audit_token_to_pidversion(fresh) != audit_token_to_pidversion(token) else { throw AppPeerError.unavailable }
        _ = try fixtureImage(fresh)
        return ["scenario": "self-exec", "samePid": true, "oldImageRefused": true,
            "freshImageValidated": true, "versionChanged": true]
    }
}
