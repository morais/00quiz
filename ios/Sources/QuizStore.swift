import Foundation
import Observation
import Security
import UserNotifications

struct QuizError: LocalizedError {
    let message: String
    var status: Int? = nil
    var errorDescription: String? { message }
}
private struct Session: Codable { let token: String; let tenantID: String; var isReview: Bool? = nil }
private struct ServerFailure: Decodable { let error: String }

@MainActor @Observable final class QuizStore {
    var snapshot: QuizSnapshot?
    var connections: [MCPConnection] = []
    var isDemo = false
    var isSignedIn = false
    var busy = false
    var notice: String?
    var lastRefreshed: Date?
    private var session: Session?
    private var refreshInProgress = false
    private let keychainService = "com.00quiz.app.session"
    var isReviewAccount: Bool { session?.isReview == true }

    init() {
        session = readSession()
        isSignedIn = session != nil
        if let path = cacheURL, let data = try? Data(contentsOf: path) {
            snapshot = try? JSONDecoder().decode(QuizSnapshot.self, from: data)
        }
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--demo") { startDemo() }
        #endif
    }

    var localDay: String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: snapshot?.preferences.timeZone ?? "") ?? .current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: .now)
    }
    var todaysQuiz: DailyQuiz? {
        guard snapshot?.today == localDay else { return nil }
        return snapshot?.quiz
    }

    func signInWithApple(identityToken: String, authorizationCode: String, rawNonce: String) async throws {
        struct Login: Decodable { struct Tenant: Decodable { let id: String }; let token: String; let tenant: Tenant }
        let login: Login = try await request("v1/auth/apple", method: "POST", payload: [
            "identityToken": identityToken, "authorizationCode": authorizationCode, "nonce": rawNonce,
            "timeZone": TimeZone.current.identifier
        ], authenticated: false)
        let newSession = Session(token: login.token, tenantID: login.tenant.id)
        try saveSession(newSession)
        session = newSession; isDemo = false; isSignedIn = true; snapshot = nil
        await refresh()
    }

    func refresh() async {
        guard isSignedIn, !isDemo, !refreshInProgress else { return }
        refreshInProgress = true
        defer { refreshInProgress = false }
        do {
            let state: QuizSnapshot = try await request("v1/snapshot")
            snapshot = state; lastRefreshed = .now; notice = nil; persist()
        } catch is CancellationError {} catch { notice = error.localizedDescription }
    }

    func signInForReview(accessCode: String) async throws {
        struct Login: Decodable { struct Tenant: Decodable { let id: String; let isReview: Bool }; let token: String; let tenant: Tenant }
        let login: Login = try await request("v1/auth/review", method: "POST", payload: ["accessCode": accessCode], authenticated: false)
        guard login.tenant.isReview else { throw QuizError(message: "This is not a sample account.") }
        let newSession = Session(token: login.token, tenantID: login.tenant.id, isReview: true)
        try saveSession(newSession)
        session = newSession; isDemo = false; isSignedIn = true; snapshot = nil
        await refresh()
    }

    func resetReviewQuiz() async throws {
        guard isReviewAccount else { return }
        let state: QuizSnapshot = try await request("v1/review/reset", method: "POST")
        snapshot = state; notice = nil; persist()
    }

    func answer(packID: String, questionIndex: Int, choiceIndex: Int) async throws {
        guard !busy else { return }
        busy = true; defer { busy = false }
        if isDemo {
            guard var state = snapshot, var quiz = state.quiz,
                  quiz.id == packID, quiz.questions.indices.contains(questionIndex), quiz.questions[questionIndex].answer == nil else { return }
            let key = DemoData.keys[questionIndex]
            quiz.questions[questionIndex].correctIndex = key
            quiz.questions[questionIndex].explanation = DemoData.explanations[questionIndex]
            quiz.questions[questionIndex].answer = QuizAnswer(choiceIndex: choiceIndex, correct: choiceIndex == key, answeredAt: ISO8601DateFormatter().string(from: .now))
            quiz.score = quiz.questions.filter { $0.answer?.correct == true }.count
            quiz.completed = quiz.answeredCount == 5
            state.quiz = quiz
            if quiz.completed { state.streak.current = 4; state.streak.longest = 4; state.streak.completedDays = 12 }
            snapshot = state
            return
        }
        do {
            let state: QuizSnapshot = try await request("v1/quizzes/\(packID)/answers", method: "POST", payload: ["questionIndex": questionIndex, "choiceIndex": choiceIndex])
            snapshot = state; lastRefreshed = .now; notice = nil; persist()
        } catch {
            if (error as? QuizError)?.status == 409 { await refresh() }
            throw error
        }
    }

    func savePreferences(_ preferences: QuizPreferences) async throws {
        if isDemo { snapshot?.preferences = preferences; return }
        let payload: [String: Any] = ["interests": preferences.interests, "language": preferences.language as Any? ?? NSNull(),
                                    "difficulty": preferences.difficulty as Any? ?? NSNull(), "timeZone": preferences.timeZone]
        let saved: QuizPreferences = try await request("v1/preferences", method: "PATCH", payload: payload)
        snapshot?.preferences = saved; persist()
        await refresh()
    }

    func saveFeedback(packID: String, message: String) async throws {
        let feedback: QuizFeedback?
        if isDemo {
            feedback = message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil
                : QuizFeedback(message: message.trimmingCharacters(in: .whitespacesAndNewlines),
                               updatedAt: ISO8601DateFormatter().string(from: .now))
        } else {
            struct Response: Decodable { let feedback: QuizFeedback? }
            let saved: Response = try await request("v1/quizzes/\(packID)/feedback", method: "PUT", payload: ["message": message])
            feedback = saved.feedback
        }
        if snapshot?.quiz?.id == packID { snapshot?.quiz?.feedback = feedback }
        if let index = snapshot?.history.firstIndex(where: { $0.id == packID }) {
            snapshot?.history[index].feedback = feedback
        }
        notice = nil; persist()
    }

    func loadConnections() async throws {
        if isDemo { connections = []; return }
        struct Response: Decodable { let connections: [MCPConnection] }
        let value: Response = try await request("v1/account/mcp-connections")
        connections = value.connections
    }
    func disconnect(_ connection: MCPConnection) async throws {
        let _: [String: Bool] = try await request("v1/account/mcp-connections/\(connection.id)", method: "DELETE")
        try await loadConnections()
    }
    func signOut() async {
        if !isDemo {
            do { let _: [String: Bool] = try await request("v1/auth/logout", method: "POST") }
            catch { notice = "Could not sign out: \(error.localizedDescription)"; return }
        }
        clearLocalSession()
    }
    func deleteAccount(identityToken: String, authorizationCode: String, rawNonce: String) async throws {
        if isDemo { clearLocalSession(); return }
        let _: [String: Bool] = try await request("v1/auth/delete-account", method: "POST", payload: [
            "identityToken": identityToken, "authorizationCode": authorizationCode, "nonce": rawNonce
        ])
        clearLocalSession()
    }
    func startDemo() {
        isDemo = true; isSignedIn = true; snapshot = DemoData.snapshot(); notice = nil
    }

    private func clearLocalSession() {
        if let path = cacheURL { try? FileManager.default.removeItem(at: path) }
        SecItemDelete([kSecClass: kSecClassGenericPassword, kSecAttrService: keychainService] as CFDictionary)
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: ["daily-quiz"])
        UserDefaults.standard.set(false, forKey: "reminderEnabled")
        session = nil; isSignedIn = false; isDemo = false; snapshot = nil; connections = []; notice = nil; lastRefreshed = nil
    }
    private func request<T: Decodable>(_ path: String, method: String = "GET", payload: [String: Any]? = nil, authenticated: Bool = true) async throws -> T {
        let requestingToken = session?.token
        var req = URLRequest(url: AppBrand.server.appending(path: path))
        req.httpMethod = method; req.timeoutInterval = 25
        req.cachePolicy = .reloadIgnoringLocalCacheData
        if authenticated {
            guard let session else { throw QuizError(message: "Please sign in again.") }
            req.setValue("Bearer \(session.token)", forHTTPHeaderField: "Authorization")
        }
        if let payload { req.httpBody = try JSONSerialization.data(withJSONObject: payload); req.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        let (data, response) = try await URLSession.shared.data(for: req)
        if authenticated && session?.token != requestingToken { throw CancellationError() }
        guard let http = response as? HTTPURLResponse else { throw QuizError(message: "The server did not respond.") }
        if http.statusCode == 401 && authenticated {
            clearLocalSession()
            throw QuizError(message: "Your session expired. Please sign in with Apple again.")
        }
        guard (200..<300).contains(http.statusCode) else {
            throw QuizError(message: (try? JSONDecoder().decode(ServerFailure.self, from: data).error) ?? "Could not complete the request. Please try again.", status: http.statusCode)
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
    private var cacheURL: URL? {
        guard let session else { return nil }
        return FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?.appending(path: "quiz-\(session.tenantID).json")
    }
    private func persist() {
        guard !isDemo, let path = cacheURL, let snapshot else { return }
        do {
            try FileManager.default.createDirectory(at: path.deletingLastPathComponent(), withIntermediateDirectories: true)
            try JSONEncoder().encode(snapshot).write(to: path, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        } catch { notice = "Your quiz is saved online, but the local cache could not be updated." }
    }
    private func readSession() -> Session? {
        var result: CFTypeRef?
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: keychainService,
                                   kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess, let data = result as? Data else { return nil }
        return try? JSONDecoder().decode(Session.self, from: data)
    }
    private func saveSession(_ session: Session) throws {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: keychainService]
        let data = try JSONEncoder().encode(session)
        let updated = SecItemUpdate(query as CFDictionary, [kSecValueData: data] as CFDictionary)
        if updated == errSecItemNotFound {
            var add = query; add[kSecValueData as String] = data
            add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            guard SecItemAdd(add as CFDictionary, nil) == errSecSuccess else { throw QuizError(message: "Could not securely save your sign-in.") }
        } else if updated != errSecSuccess { throw QuizError(message: "Could not securely save your sign-in.") }
    }
}
