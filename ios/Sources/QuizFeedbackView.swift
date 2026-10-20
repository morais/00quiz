import SwiftUI

struct QuizFeedbackButton: View {
    let quiz: DailyQuiz
    @State private var showingFeedback = false

    var body: some View {
        if quiz.completed {
            VStack(spacing: 8) {
                Button { showingFeedback = true } label: {
                    Label(quiz.feedback == nil ? "Share feedback" : "Edit feedback", systemImage: "bubble.left.and.text.bubble.right")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered).controlSize(.large).tint(QuizStyle.green)
                if quiz.feedback != nil {
                    Text("Saved for your agent")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
            .sheet(isPresented: $showingFeedback) {
                NavigationStack { QuizFeedbackView(quiz: quiz) }
            }
        }
    }
}

struct QuizFeedbackView: View {
    @Environment(QuizStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let quiz: DailyQuiz
    @State private var message: String
    @State private var saving = false
    @State private var errorText: String?
    private let suggestions = ["A little harder, please.", "A little easier, please.", "More variety, please."]
    private var trimmed: String { message.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var unchanged: Bool { trimmed == (quiz.feedback?.message ?? "") }

    init(quiz: DailyQuiz) {
        self.quiz = quiz
        _message = State(initialValue: quiz.feedback?.message ?? "")
    }

    var body: some View {
        Form {
            Section {
                Text("Give your host a nudge.").font(.headline)
                Text("Tell your agent what you’d like more or less of: topics, difficulty, variety, or explanations.")
                    .foregroundStyle(.secondary)
                Text(quiz.title).font(.subheadline.weight(.medium))
                Text(dayLabel(quiz.day)).font(.caption).foregroundStyle(.secondary)
            }
            Section {
                TextField("More space, fewer dates, a little harder…", text: $message, axis: .vertical)
                    .lineLimit(5...10)
                    .accessibilityLabel("Feedback for your quiz agent")
                Text("\(message.utf16.count)/1,000")
                    .font(.caption).foregroundStyle(message.utf16.count > 1000 ? Color.red : Color.secondary)
            } header: { Text("For your next quizzes") } footer: {
                Text("Your connected agent can read this on its next run. Already-published quizzes stay as they are. Clear and save to remove your note.")
            }
            Section("Need a starting point?") {
                ForEach(suggestions, id: \.self) { suggestion in
                    Button(suggestion) {
                        message = trimmed.isEmpty ? suggestion : trimmed + "\n" + suggestion
                    }
                    .disabled(trimmed.contains(suggestion) || (trimmed + "\n" + suggestion).utf16.count > 1000)
                }
            }
            if store.isDemo {
                Section { Text("Demo feedback stays on this device for this session.").font(.footnote).foregroundStyle(.secondary) }
            }
        }
        .disabled(saving)
        .navigationTitle(quiz.feedback == nil ? "Share feedback" : "Edit feedback")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(saving) }
            ToolbarItem(placement: .confirmationAction) {
                Button(saving ? "Saving…" : "Save") {
                    saving = true
                    Task {
                        defer { saving = false }
                        do {
                            try await store.saveFeedback(packID: quiz.id, message: trimmed)
                            dismiss()
                        } catch { errorText = error.localizedDescription }
                    }
                }
                .disabled(saving || message.utf16.count > 1000 || unchanged)
            }
        }
        .interactiveDismissDisabled(saving)
        .alert("Could not save feedback", isPresented: Binding(get: { errorText != nil }, set: { if !$0 { errorText = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(errorText ?? "") }
    }
}
