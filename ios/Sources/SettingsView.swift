import SwiftUI
import UserNotifications
import UIKit

struct SettingsView: View {
    @Environment(QuizStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var deleteAccount = false
    @State private var resettingSamples = false
    @State private var showingDeveloper = false
    var body: some View {
        List {
            Section {
                NavigationLink { PreferencesView() } label: { Label("Your interests & preferences", systemImage: "slider.horizontal.3") }
                NavigationLink { AgentSetupView() } label: { Label("Your agent", systemImage: "link") }
                NavigationLink { ReminderView() } label: { Label("Morning reminder", systemImage: "bell") }
            }
            Section {
                Text("Your agent sets the stage. You bring the curiosity.").foregroundStyle(.secondary)
                Link("Privacy", destination: AppBrand.server.appending(path: "privacy"))
                Link("Support", destination: URL(string: "https://00quiz.com/support")!)
                Button { showingDeveloper = true } label: {
                    LabeledContent("Version", value: "\(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0") (\(Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "1"))")
                        .quizTapTarget(alignment: .leading)
                }
                .buttonStyle(.plain)
            }
            Section {
                Button(store.isDemo ? "Leave demo" : store.isReviewAccount ? "Leave sample account" : "Sign out") { Task { await store.signOut(); if !store.isSignedIn { dismiss() } } }
                if !store.isDemo && !store.isReviewAccount { Button("Delete account", role: .destructive) { deleteAccount = true } }
            }
            if store.isReviewAccount {
                Section {
                    Text("App Review sample account").font(.headline)
                    Text("These quizzes and past scores are sample data. Restart today’s quiz to try answering again.").foregroundStyle(.secondary)
                    Button(resettingSamples ? "Restarting…" : "Restart sample quiz") {
                        resettingSamples = true
                        Task {
                            defer { resettingSamples = false }
                            do { try await store.resetReviewQuiz() }
                            catch { store.notice = error.localizedDescription }
                        }
                    }.disabled(resettingSamples)
                }
            }
            if let notice = store.notice { Section { Text(notice).font(.footnote).foregroundStyle(.secondary) } }
        }
        .navigationTitle("Settings")
        .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        .sheet(isPresented: $deleteAccount) { DeleteAccountView() }
        .sheet(isPresented: $showingDeveloper) { DeveloperView() }
    }
}

private struct DeveloperView: View {
    @Environment(\.dismiss) private var dismiss
    @AppStorage(OnboardingReplay.requestKey) private var replayOnNextLaunch = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Toggle("Replay onboarding on next launch", isOn: $replayOnNextLaunch)
                } header: { Text("Onboarding") } footer: {
                    Text("Quit and reopen 00Quiz to see the welcome and agent setup again. Your account, questions, scores, streak and preferences are kept. The switch resets after launch.")
                }
            }
            .navigationTitle("Developer")
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } } }
        }
    }
}

struct PreferencesView: View {
    @Environment(QuizStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var interests = ""
    @State private var language = ""
    @State private var difficulty: String? = nil
    @State private var timeZone = TimeZone.current.identifier
    @State private var busy = false
    @State private var errorText: String?
    var body: some View {
        Form {
            Section {
                Text("Everything here is optional. Your agent can choose defaults from what it knows about you. Tweak them whenever you like.")
                    .foregroundStyle(.secondary)
            }
            Section {
                TextField("Let my agent choose", text: $interests, axis: .vertical)
                    .lineLimit(2...5)
            } header: { Text("Interests") } footer: { Text("Separate interests with commas. Leave empty to let your agent choose.") }
            Section {
                LabeledContent("Language") {
                    TextField("Let my agent choose", text: $language)
                        .multilineTextAlignment(.trailing)
                }
                Picker("Difficulty", selection: $difficulty) {
                    Text("Let my agent choose").tag(nil as String?)
                    Text("Easy").tag("easy" as String?)
                    Text("Balanced").tag("balanced" as String?)
                    Text("Challenging").tag("challenging" as String?)
                }
            } header: { Text("Question style") } footer: { Text("Leave language empty and difficulty on ‘Let my agent choose’ for your agent to decide.") }
            Section {
                Text(timeZone)
                Button("Use this iPhone’s time zone") { timeZone = TimeZone.current.identifier }
            } header: { Text("Your quiz day") } footer: { Text("Quizzes close at midnight in this time zone. Update it when you travel if you want to follow the local day.") }
            if let errorText { Section { Text(errorText).foregroundStyle(.red) } }
        }
        .navigationTitle("Your preferences")
        .toolbar { ToolbarItem(placement: .confirmationAction) {
            Button("Save") {
                busy = true
                let values = interests.split(separator: ",").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
                let trimmedLanguage = language.trimmingCharacters(in: .whitespacesAndNewlines)
                Task {
                    defer { busy = false }
                    do {
                        try await store.savePreferences(QuizPreferences(interests: values, language: trimmedLanguage.isEmpty ? nil : trimmedLanguage, difficulty: difficulty, timeZone: timeZone))
                        dismiss()
                    } catch { errorText = error.localizedDescription }
                }
            }.disabled(busy)
        } }
        .onAppear {
            if let prefs = store.snapshot?.preferences {
                interests = prefs.interests.joined(separator: ", "); language = prefs.language ?? ""
                difficulty = prefs.difficulty; timeZone = prefs.timeZone
            }
        }
    }
}

struct AgentSetupView: View {
    @Environment(QuizStore.self) private var store
    @Environment(\.scenePhase) private var scenePhase
    @State private var copied = false
    @State private var errorText: String?
    @State private var removing: MCPConnection?
    private let setupPrompt = "Prepare today’s 00Quiz, then do it again every morning at 7:00."
    var body: some View {
        List {
            Section {
                Label("Your agent is your quiz host", systemImage: "mic.fill").font(.headline)
                Text("Connect your agent to 00Quiz, then give it the request below. Connecting and scheduling are separate steps.")
            }
            Section("1 · Connect") {
                if let url = AppBrand.chatGPTPluginURL {
                    Link(destination: url) { Label("Add to ChatGPT", systemImage: "arrow.up.forward.app") }
                    Text("Opens the 00Quiz plugin in ChatGPT. Sign in with the same Apple account you use in 00Quiz.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                if let url = AppBrand.claudeConnectURL {
                    Link(destination: url) { Label("Add to Claude", systemImage: "arrow.up.forward.app") }
                    Text("Opens Claude with 00Quiz ready to add. Sign in with the same Apple account you use in 00Quiz.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                DisclosureGroup("Using another agent?") {
                    Text(AppBrand.endpoint).font(.callout.monospaced()).textSelection(.enabled)
                    Button("Copy MCP address", systemImage: "doc.on.doc") { UIPasteboard.general.string = AppBrand.endpoint }
                    Text("Use an agent that supports remote MCP with OAuth and scheduled tool calls. Add this address in its MCP integrations. Sign in with the same Apple account you use in 00Quiz, then approve its quiz access.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
            Section("2 · Set the daily show in motion") {
                Text("Tell your agent “\(setupPrompt)”")
                Button(copied ? "Copied" : "Copy", systemImage: copied ? "checkmark" : "doc.on.doc") {
                    UIPasteboard.general.string = setupPrompt; copied = true
                }
            }
            Section("Connected agents") {
                if store.isDemo { Text("Connections are unavailable in demo mode.").foregroundStyle(.secondary) }
                else if store.connections.isEmpty { Text("No active MCP connections yet.").foregroundStyle(.secondary) }
                ForEach(store.connections) { connection in
                    MCPConnectionRow(connection: connection) { removing = connection }
                }
                Text("This list confirms MCP access. Your agent manages and confirms its own recurring schedule.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            if let errorText { Section { Text(errorText).foregroundStyle(.red) } }
        }
        .navigationTitle("Your agent")
        .toolbar { ToolbarItem(placement: .topBarTrailing) { DoneIfPresented() } }
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            await load()
        }
        .confirmationDialog("Disconnect \(removing?.clientName ?? "agent")?", isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }), titleVisibility: .visible) {
            Button("Disconnect", role: .destructive) {
                guard let connection = removing else { return }
                Task { do { try await store.disconnect(connection) } catch { errorText = error.localizedDescription }; removing = nil }
            }
        }
    }
    private func load() async {
        do { try await store.loadConnections(); errorText = nil }
        catch is CancellationError {}
        catch let error as URLError where error.code == .cancelled {}
        catch { errorText = error.localizedDescription }
    }
}

struct MCPConnectionRow: View {
    let connection: MCPConnection
    let onDisconnect: () -> Void

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(connection.clientName).font(.headline)
                Text("Expires \(dayLabel(String(connection.expiresAt.prefix(10))))").font(.caption).foregroundStyle(.secondary)
            }
            Spacer(minLength: 8)
            Button(role: .destructive, action: onDisconnect) {
                Text("Disconnect").quizTapTarget(alignment: .trailing)
            }
            .buttonStyle(.borderless)
            .fixedSize(horizontal: true, vertical: false)
            .accessibilityLabel("Disconnect \(connection.clientName)")
        }
    }
}

private struct DoneIfPresented: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.isPresented) private var isPresented
    var body: some View { if isPresented { Button("Done") { dismiss() } } }
}

struct ReminderView: View {
    @Environment(QuizStore.self) private var store
    @AppStorage("reminderEnabled") private var enabled = false
    @AppStorage("reminderHour") private var hour = 8
    @AppStorage("reminderMinute") private var minute = 0
    @State private var selection = Date()
    @State private var errorText: String?
    @State private var saving = false
    var body: some View {
        Form {
            Section {
                Toggle("Remind me each morning", isOn: $enabled)
                if enabled { DatePicker("Time", selection: $selection, displayedComponents: .hourAndMinute) }
            } footer: { Text("A gentle nudge to check in with your curiosity. The reminder follows this iPhone’s local time and does not confirm that an agent has delivered a quiz.") }
            if let errorText { Section { Text(errorText).foregroundStyle(.secondary) } }
            if store.isDemo { Text("Reminders are disabled in demo mode.").foregroundStyle(.secondary) }
        }
        .navigationTitle("Morning reminder")
        .disabled(store.isDemo || saving)
        .onAppear { selection = Calendar.current.date(bySettingHour: hour, minute: minute, second: 0, of: .now) ?? .now }
        .onChange(of: enabled) { _, _ in Task { await schedule() } }
        .onChange(of: selection) { _, _ in Task { await schedule() } }
    }
    private func schedule() async {
        guard !store.isDemo, !saving else { return }
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: ["daily-quiz"])
        guard enabled else { return }
        saving = true; defer { saving = false }
        do {
            guard try await center.requestAuthorization(options: [.alert, .sound]) else {
                enabled = false; errorText = "Notifications are off. Enable them for 00Quiz in iPhone Settings to use a reminder."; return
            }
            let components = Calendar.current.dateComponents([.hour, .minute], from: selection)
            hour = components.hour ?? 8; minute = components.minute ?? 0
            let content = UNMutableNotificationContent()
            content.title = "A little more curious?"
            content.body = "Take a moment for your daily five in 00Quiz."
            content.sound = .default
            try await center.add(UNNotificationRequest(identifier: "daily-quiz", content: content, trigger: UNCalendarNotificationTrigger(dateMatching: components, repeats: true)))
            errorText = nil
        } catch { enabled = false; errorText = error.localizedDescription }
    }
}
