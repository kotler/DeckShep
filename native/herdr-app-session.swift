import Darwin
import Foundation

// A session owns the original kernel token and descriptor. Caller identifiers
// never enter this object; it never consumes or emits application socket bytes.
final class AppPeerSession {
    private let descriptor: Int32
    private let token: audit_token_t
    private let original: NSDictionary
    private let started = mach_continuous_time()
    private var checked = false
    private var finished = false

    init(_ source: Int32) throws {
        descriptor = fcntl(source, F_DUPFD_CLOEXEC, 10)
        guard descriptor >= 0 else { throw AppPeerError.unavailable }
        do {
            try Self.connected(descriptor)
            token = try Self.capture(descriptor)
            original = try inspectAppPeerToken(token) as NSDictionary
            guard Self.same(token, try Self.capture(descriptor)) else { throw AppPeerError.unavailable }
        } catch { close(descriptor); throw AppPeerError.unavailable }
        try validTime()
    }
    deinit { close(descriptor) }

    func remaining() throws -> Int32 {
        var scale = mach_timebase_info_data_t()
        guard mach_timebase_info(&scale) == KERN_SUCCESS else { throw AppPeerError.unavailable }
        let elapsed = Double(mach_continuous_time() - started) * Double(scale.numer) / Double(scale.denom) / 1_000_000
        guard elapsed >= 0, elapsed < 1000 else { throw AppPeerError.unavailable }
        return Int32(ceil(1000 - elapsed))
    }
    func validTime() throws { _ = try remaining() }

    static func capture(_ fd: Int32) throws -> audit_token_t {
        var token = audit_token_t()
        var size = socklen_t(MemoryLayout<audit_token_t>.size)
        guard getsockopt(fd, SOL_LOCAL, LOCAL_PEERTOKEN, &token, &size) == 0,
              size == MemoryLayout<audit_token_t>.size else { throw AppPeerError.unavailable }
        return token
    }
    static func same(_ left: audit_token_t, _ right: audit_token_t) -> Bool {
        withUnsafeBytes(of: left) { first in withUnsafeBytes(of: right) { second in first.elementsEqual(second) } }
    }
    static func events(_ fd: Int32) throws -> Int16 {
        var entry = pollfd(fd: fd, events: Int16(POLLIN), revents: 0)
        guard poll(&entry, 1, 0) >= 0, entry.revents & Int16(POLLERR | POLLNVAL) == 0 else { throw AppPeerError.unavailable }
        return entry.revents
    }
    static func connected(_ fd: Int32) throws {
        guard try events(fd) & Int16(POLLHUP) == 0 else { throw AppPeerError.unavailable }
    }
    func image() throws -> [String: Any] {
        try validTime()
        let current = try inspectAppPeerToken(token)
        guard original.isEqual(to: current) else { throw AppPeerError.unavailable }
        try validTime()
        return current.filter { $0.key != "protocol" }
    }
    func check() throws -> [String: Any] {
        guard !checked, !finished else { throw AppPeerError.unavailable }
        checked = true
        try Self.connected(descriptor)
        guard Self.same(token, try Self.capture(descriptor)) else { throw AppPeerError.unavailable }
        let value = try image()
        guard Self.same(token, try Self.capture(descriptor)) else { throw AppPeerError.unavailable }
        try Self.connected(descriptor)
        return value
    }
    func finish() throws -> ([String: Any], String) {
        guard checked, !finished else { throw AppPeerError.unavailable }
        finished = true
        let state: String
        if let current = try? Self.capture(descriptor) {
            guard Self.same(token, current) else { throw AppPeerError.unavailable }
            state = "matched"
        } else {
            guard try Self.events(descriptor) & Int16(POLLHUP) != 0 else { throw AppPeerError.unavailable }
            state = "unavailable"
        }
        return (try image(), state)
    }
}

func sessionLine(_ session: AppPeerSession) throws -> String {
    var bytes: [UInt8] = []
    while bytes.count < 256 {
        var entry = pollfd(fd: STDIN_FILENO, events: Int16(POLLIN), revents: 0)
        guard poll(&entry, 1, try session.remaining()) > 0,
              entry.revents & Int16(POLLERR | POLLNVAL) == 0 else { throw AppPeerError.unavailable }
        var byte: UInt8 = 0
        guard read(STDIN_FILENO, &byte, 1) == 1 else { throw AppPeerError.unavailable }
        try session.validTime()
        if byte == 10 {
            guard let line = String(bytes: bytes, encoding: .utf8) else { throw AppPeerError.unavailable }
            return line
        }
        bytes.append(byte)
    }
    throw AppPeerError.unavailable
}

func sessionFrame(_ value: [String: Any]) throws {
    let bytes = try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
    guard bytes.count < 2600 else { throw AppPeerError.unavailable }
    FileHandle.standardOutput.write(bytes + Data([10]))
}

func runAppPeerSession() throws {
    // Bound even a stalled Security call. Every successful frame also samples
    // the continuous clock so suspend/resume can never extend its authority.
    DispatchQueue.global().asyncAfter(deadline: .now() + 1) { _exit(1) }
    var currentSequence = 0
    do {
    let session = try AppPeerSession(3)
    try sessionFrame(["protocol": 2, "seq": 0, "state": "captured", "peer": session.image()])
    for sequence in 1...2 {
        currentSequence = sequence
        let line = try sessionLine(session)
        if line == "{\"protocol\":2,\"seq\":\(sequence),\"op\":\"dispose\"}" { return }
        let operation = sequence == 1 ? "check" : "finish"
        guard line == "{\"protocol\":2,\"seq\":\(sequence),\"op\":\"\(operation)\"}" else { throw AppPeerError.unavailable }
        if sequence == 1 {
            try sessionFrame(["protocol": 2, "seq": 1, "state": "checked", "peer": session.check()])
        } else {
            // Final command closes the private control input. Refuse trailing
            // commands/bytes before producing any positive final frame.
            var input = pollfd(fd: STDIN_FILENO, events: Int16(POLLIN), revents: 0)
            var extra: UInt8 = 0
            guard poll(&input, 1, try session.remaining()) > 0,
                  read(STDIN_FILENO, &extra, 1) == 0 else { throw AppPeerError.unavailable }
            let (peer, token) = try session.finish()
            try sessionFrame(["protocol": 2, "seq": 2, "state": "finished", "peer": peer, "socketToken": token])
        }
    }
    } catch {
        try? sessionFrame(["protocol": 2, "seq": currentSequence, "state": "refused", "reason": "unavailable"])
        throw AppPeerError.unavailable
    }
}
