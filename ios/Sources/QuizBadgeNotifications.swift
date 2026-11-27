import Observation
import SwiftUI
import UIKit
import UserNotifications

@MainActor @Observable final class QuizBadgeNotifications {
    static let shared = QuizBadgeNotifications()
    private(set) var enabled = UserDefaults.standard.bool(forKey: "quizBadgeEnabled")
    private(set) var saving = false
    var errorText: String?
    @ObservationIgnored private weak var store: QuizStore?
    private var token = UserDefaults.standard.string(forKey: "quizBadgeToken")
    private var registeredSignature: String?
    private var registeredAt = Date.distantPast
    private var registering = false
    private var owner = UserDefaults.standard.string(forKey: "quizBadgeOwner")
    private let installationID: String
    private var environment: String {
        Bundle.main.object(forInfoDictionaryKey: "QuizPushEnvironment") as? String ?? "development"
    }

    private init() {
        let defaults = UserDefaults.standard
        installationID = defaults.string(forKey: "quizBadgeInstallation") ?? UUID().uuidString
        defaults.set(installationID, forKey: "quizBadgeInstallation")
    }

    func setEnabled(_ value: Bool, store: QuizStore) async {
        guard !saving else { return }
        saving = true; defer { saving = false }
        self.store = store
        errorText = nil
        if value {
            guard store.isSignedIn, !store.isDemo, !store.isReviewAccount, let account = store.accountID else { return }
            do {
                _ = try await UNUserNotificationCenter.current().requestAuthorization(options: [.badge])
                let settings = await UNUserNotificationCenter.current().notificationSettings()
                guard settings.badgeSetting == .enabled else {
                    errorText = "Allow badges for 00Quiz in Settings, then turn this on again."
                    return
                }
                guard store.accountID == account, store.isSignedIn else { return }
                owner = account
                UserDefaults.standard.set(account, forKey: "quizBadgeOwner")
                enabled = true
                UserDefaults.standard.set(true, forKey: "quizBadgeEnabled")
                UIApplication.shared.registerForRemoteNotifications()
            } catch { errorText = error.localizedDescription; return }
        } else {
            enabled = false
            UserDefaults.standard.set(false, forKey: "quizBadgeEnabled")
        }
        registeredSignature = nil
        await synchronize(store)
    }

    func synchronize(_ store: QuizStore) async {
        self.store = store
        guard store.isSignedIn, !store.isDemo, !store.isReviewAccount, let account = store.accountID else {
            await clearLocalBadge(); return
        }
        if let owner, owner != account { reset() }
        if enabled {
            let settings = await UNUserNotificationCenter.current().notificationSettings()
            guard store.accountID == account else { return }
            if settings.badgeSetting != .enabled {
                enabled = false
                UserDefaults.standard.set(false, forKey: "quizBadgeEnabled")
                registeredSignature = nil
                errorText = "Badges are off in Settings."
            } else { UIApplication.shared.registerForRemoteNotifications() }
        }
        await updateLocalBadge(store)
        guard let token, owner == account, !registering else { return }
        let signature = "\(account)-\(token)-\(enabled)-\(environment)"
        guard signature != registeredSignature || Date.now.timeIntervalSince(registeredAt) > 12 * 3600 else { return }
        registering = true; defer { registering = false }
        do {
            try await store.setQuizBadgeDevice(installationID: installationID, token: token, environment: environment, enabled: enabled)
            guard store.accountID == account else { return }
            registeredSignature = signature; registeredAt = .now
            errorText = nil
        } catch is CancellationError {
        } catch {
            errorText = enabled ? "Could not connect quiz badges. We’ll retry when the app is active."
                : "Badge turned off here. Open the app online to finish turning it off on the server."
        }
    }

    func didRegister(_ data: Data) {
        token = data.map { String(format: "%02x", $0) }.joined()
        UserDefaults.standard.set(token, forKey: "quizBadgeToken")
        if let store { Task { await synchronize(store) } }
    }

    func didFailRegistration() {
        if enabled { errorText = "Could not connect to Apple notifications. We’ll retry when the app is active." }
    }

    func quizChanged(_ store: QuizStore) {
        Task { await updateLocalBadge(store) }
    }

    private func updateLocalBadge(_ store: QuizStore) async {
        if !enabled || !store.isSignedIn || store.isDemo || store.isReviewAccount { await clearLocalBadge(); return }
        // Keep an incoming server badge until a fresh snapshot confirms today's state.
        guard store.hasCheckedTodaysQuiz || store.todaysQuiz != nil else { return }
        let count = store.todaysQuiz.map { $0.completed ? 0 : 1 } ?? 0
        try? await UNUserNotificationCenter.current().setBadgeCount(count)
    }

    func receivedPush() async {
        guard let store else { if !enabled { await clearLocalBadge() }; return }
        await store.refresh()
        await updateLocalBadge(store)
    }

    func reset() {
        enabled = false; owner = nil; registeredSignature = nil
        UserDefaults.standard.removeObject(forKey: "quizBadgeEnabled")
        UserDefaults.standard.removeObject(forKey: "quizBadgeOwner")
        token = nil
        UserDefaults.standard.removeObject(forKey: "quizBadgeToken")
        Task { await clearLocalBadge() }
    }

    private func clearLocalBadge() async { try? await UNUserNotificationCenter.current().setBadgeCount(0) }
}

final class QuizAppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Task { @MainActor in QuizBadgeNotifications.shared.didRegister(deviceToken) }
    }
    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        Task { @MainActor in QuizBadgeNotifications.shared.didFailRegistration() }
    }
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        if notification.request.identifier == "daily-quiz" { completionHandler([.banner, .sound]); return }
        // Foreground pushes reconcile with the server so a queued pending push
        // cannot restore the badge after this device has completed the quiz.
        Task { @MainActor in await QuizBadgeNotifications.shared.receivedPush(); completionHandler([]) }
    }
}

struct QuizBadgeSettingsView: View {
    @Environment(QuizStore.self) private var store
    @State private var badges = QuizBadgeNotifications.shared
    var body: some View {
        Form {
            Section {
                Toggle("Badge when today’s quiz is ready", isOn: Binding(get: { badges.enabled }, set: { value in
                    Task { await badges.setEnabled(value, store: store) }
                }))
                .disabled(badges.saving || store.isDemo || store.isReviewAccount)
            } footer: {
                Text("Off by default. Show a 1 on this device’s app icon while today’s quiz is unfinished. It clears when you finish all five questions. No banner or sound.")
            }
            if let error = badges.errorText { Section { Text(error).foregroundStyle(.secondary) } }
            Section { Link("Open notification settings", destination: URL(string: UIApplication.openNotificationSettingsURLString)!) }
            if store.isDemo || store.isReviewAccount { Text("Quiz badges are unavailable in sample accounts.").foregroundStyle(.secondary) }
        }
        .navigationTitle("Quiz badge")
    }
}
