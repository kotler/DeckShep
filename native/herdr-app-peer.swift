import Darwin
import Foundation
import Security

enum AppPeerError: Error { case unavailable }

func peerProcess(_ token: audit_token_t) throws -> (proc_bsdinfo, String) {
    let pid = audit_token_to_pid(token)
    var info = proc_bsdinfo()
    let size = Int32(MemoryLayout<proc_bsdinfo>.size)
    guard pid > 0, audit_token_to_euid(token) == getuid(),
          proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, &info, size) == size,
          info.pbi_pid == UInt32(pid), info.pbi_uid == getuid(),
          info.pbi_ruid == getuid() else { throw AppPeerError.unavailable }
    var copy = token
    // PROC_PIDPATHINFO_MAXSIZE is 4*MAXPATHLEN (not imported as a Swift macro).
    var buffer = [CChar](repeating: 0, count: 4 * Int(MAXPATHLEN))
    // The audit token includes PID version: a reused PID cannot resolve here.
    guard proc_pidpath_audittoken(&copy, &buffer, UInt32(buffer.count)) > 0 else {
        throw AppPeerError.unavailable
    }
    return (info, String(cString: buffer))
}

func peerCodeHash(_ token: audit_token_t) throws -> String {
    let audit = withUnsafeBytes(of: token) { Data($0) }
    var code: SecCode?
    let flags = SecCSFlags(rawValue: 0)
    guard SecCodeCopyGuestWithAttributes(nil,
              [kSecGuestAttributeAudit: audit] as CFDictionary, flags, &code) == errSecSuccess,
          let code,
          SecCodeCheckValidity(code, flags, nil) == errSecSuccess else {
        throw AppPeerError.unavailable
    }
    var staticCode: SecStaticCode?
    var information: CFDictionary?
    guard SecCodeCopyStaticCode(code, flags, &staticCode) == errSecSuccess,
          let staticCode,
          SecCodeCopySigningInformation(staticCode, flags, &information) == errSecSuccess,
          let values = information as? [String: Any],
          let hash = values[kSecCodeInfoUnique as String] as? Data,
          !hash.isEmpty,
          SecCodeCheckValidity(code, flags, nil) == errSecSuccess else { throw AppPeerError.unavailable }
    return hash.map { String(format: "%02x", $0) }.joined()
}

func inspectAppPeer(_ descriptor: Int32) throws -> [String: Any] {
    var token = audit_token_t()
    var size = socklen_t(MemoryLayout<audit_token_t>.size)
    guard getsockopt(descriptor, SOL_LOCAL, LOCAL_PEERTOKEN, &token, &size) == 0,
          size == MemoryLayout<audit_token_t>.size else { throw AppPeerError.unavailable }
    return try inspectAppPeerToken(token)
}

func inspectAppPeerToken(_ token: audit_token_t) throws -> [String: Any] {
    let (before, executable) = try peerProcess(token)
    let hash = try peerCodeHash(token)
    let (after, afterExecutable) = try peerProcess(token)
    guard executable == afterExecutable,
          before.pbi_start_tvsec == after.pbi_start_tvsec,
          before.pbi_start_tvusec == after.pbi_start_tvusec else { throw AppPeerError.unavailable }
    return [
        "protocol": 1, "pid": audit_token_to_pid(token), "uid": audit_token_to_euid(token),
        "pidVersion": audit_token_to_pidversion(token),
        "startSeconds": String(before.pbi_start_tvsec),
        "startMicros": before.pbi_start_tvusec,
        "executable": executable, "cdHash": hash,
    ]
}
