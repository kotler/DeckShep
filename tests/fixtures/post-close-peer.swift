import Darwin
import Foundation

// Fixture-only primitive for a proposed per-connection helper. It is never
// linked into the packaged helper or used by production transport.
struct FixturePeerImage: Equatable {
    let pid: Int32
    let uid: uid_t
    let version: UInt32
    let seconds: UInt64
    let micros: UInt64
    let executable: String
    let hash: String
}

func fixtureToken(_ descriptor: Int32) throws -> audit_token_t {
    var token = audit_token_t()
    var size = socklen_t(MemoryLayout<audit_token_t>.size)
    guard getsockopt(descriptor, SOL_LOCAL, LOCAL_PEERTOKEN, &token, &size) == 0,
          size == MemoryLayout<audit_token_t>.size else { throw AppPeerError.unavailable }
    return token
}

func fixtureImage(_ token: audit_token_t) throws -> FixturePeerImage {
    // This fixture must never inspect another process, including a reused PID.
    guard audit_token_to_pid(token) == getpid(), audit_token_to_euid(token) == getuid() else {
        throw AppPeerError.unavailable
    }
    let (before, executable) = try peerProcess(token)
    let hash = try peerCodeHash(token)
    let (after, afterExecutable) = try peerProcess(token)
    guard executable == afterExecutable,
          before.pbi_start_tvsec == after.pbi_start_tvsec,
          before.pbi_start_tvusec == after.pbi_start_tvusec else { throw AppPeerError.unavailable }
    return FixturePeerImage(pid: getpid(), uid: getuid(), version: UInt32(truncatingIfNeeded: audit_token_to_pidversion(token)),
        seconds: before.pbi_start_tvsec, micros: before.pbi_start_tvusec, executable: executable, hash: hash)
}

func fixtureSameToken(_ left: audit_token_t, _ right: audit_token_t) -> Bool {
    withUnsafeBytes(of: left) { first in withUnsafeBytes(of: right) { second in first.elementsEqual(second) } }
}

func fixtureConnected(_ descriptor: Int32) throws {
    var entry = pollfd(fd: descriptor, events: Int16(POLLIN), revents: 0)
    guard poll(&entry, 1, 0) >= 0,
          entry.revents & Int16(POLLHUP | POLLERR | POLLNVAL) == 0 else { throw AppPeerError.unavailable }
}

final class FixturePostCloseLease {
    private var descriptor: Int32
    private let token: audit_token_t
    private let image: FixturePeerImage
    private let started: UInt64
    private let now: () -> UInt64
    private var spent = false
    private var preflighted = false

    init(_ source: Int32, now: @escaping () -> UInt64) throws {
        self.now = now
        self.started = now()
        // Pin a kernel reference. Reusing the caller's FD number cannot replace it.
        let duplicate = fcntl(source, F_DUPFD_CLOEXEC, 10)
        guard duplicate >= 0 else { throw AppPeerError.unavailable }
        do {
            try fixtureConnected(duplicate)
            let token = try fixtureToken(duplicate)
            let image = try fixtureImage(token)
            guard fixtureSameToken(token, try fixtureToken(duplicate)) else { throw AppPeerError.unavailable }
            self.descriptor = duplicate
            self.token = token
            self.image = image
        } catch { close(duplicate); throw AppPeerError.unavailable }
        try validTime()
    }

    private func dispose() { if descriptor >= 0 { close(descriptor); descriptor = -1 } }
    deinit { dispose() }

    func fixtureSeesPeerClose() -> Bool {
        var entry = pollfd(fd: descriptor, events: Int16(POLLIN), revents: 0)
        return poll(&entry, 1, 0) >= 0 && entry.revents & Int16(POLLHUP) != 0
    }

    private func validTime() throws {
        let current = now()
        guard current >= started, current - started < 1_000_000_000 else { throw AppPeerError.unavailable }
    }

    func beforeWrite() throws {
        do {
            guard !spent else { throw AppPeerError.unavailable }
            try validTime()
            try fixtureConnected(descriptor)
            guard fixtureSameToken(token, try fixtureToken(descriptor)),
                  try fixtureImage(token) == image else { throw AppPeerError.unavailable }
            guard fixtureSameToken(token, try fixtureToken(descriptor)) else { throw AppPeerError.unavailable }
            try validTime()
            preflighted = true
        } catch { spent = true; dispose(); throw AppPeerError.unavailable }
    }

    func finish() throws {
        guard !spent else { throw AppPeerError.unavailable }
        spent = true
        defer { dispose() }
        guard preflighted else { throw AppPeerError.unavailable }
        try validTime()
        // Always re-query the process via the original kernel token. Failure to
        // query a disconnected socket is not itself evidence of identity.
        if let current = try? fixtureToken(descriptor) {
            guard fixtureSameToken(current, token) else { throw AppPeerError.unavailable }
        } else {
            // Missing metadata is permitted only for this pinned closed socket,
            // never for a lost descriptor or an unexplained inspection failure.
            guard fixtureSeesPeerClose() else { throw AppPeerError.unavailable }
        }
        guard try fixtureImage(token) == image else { throw AppPeerError.unavailable }
        try validTime()
    }
}

final class FixtureSocketPair {
    let file: String
    let listener: Int32
    let client: Int32
    private var server: Int32 = -1

    init(_ file: String) throws {
        self.file = file
        listener = socket(AF_UNIX, SOCK_STREAM, 0)
        client = socket(AF_UNIX, SOCK_STREAM, 0)
        guard listener >= 0, client >= 0 else { throw AppPeerError.unavailable }
        var address = sockaddr_un()
        address.sun_family = sa_family_t(AF_UNIX)
        address.sun_len = UInt8(MemoryLayout<sockaddr_un>.size)
        let bytes = Array(file.utf8CString).map { UInt8(bitPattern: $0) }
        guard bytes.count <= MemoryLayout.size(ofValue: address.sun_path) else { throw AppPeerError.unavailable }
        withUnsafeMutableBytes(of: &address.sun_path) { $0.copyBytes(from: bytes) }
        let size = socklen_t(MemoryLayout<sockaddr_un>.size)
        let bound = withUnsafePointer(to: &address) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { bind(listener, $0, size) }
        }
        guard bound == 0, chmod(file, 0o600) == 0, listen(listener, 1) == 0 else { throw AppPeerError.unavailable }
        let connected = withUnsafePointer(to: &address) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { connect(client, $0, size) }
        }
        guard connected == 0 else { throw AppPeerError.unavailable }
        server = accept(listener, nil, nil)
        guard server >= 0 else { throw AppPeerError.unavailable }
    }

    func replyAndClose() throws {
        var reply: [UInt8] = [123, 125, 10]
        guard write(server, &reply, reply.count) == reply.count else { throw AppPeerError.unavailable }
        close(server); server = -1
        var bytes = [UInt8](repeating: 0, count: 8)
        var received: [UInt8] = []
        for _ in 0..<4 {
            let count = read(client, &bytes, bytes.count)
            guard count >= 0 else { throw AppPeerError.unavailable }
            if count == 0 {
                guard received == reply else { throw AppPeerError.unavailable }
                return
            }
            received.append(contentsOf: bytes.prefix(count))
        }
        throw AppPeerError.unavailable
    }

    func closeServer() { if server >= 0 { close(server); server = -1 } }

    deinit {
        if server >= 0 { close(server) }
        close(client); close(listener); unlink(file)
    }
}
