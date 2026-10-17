import SwiftUI

enum QuizStyle {
    static let green = Color(uiColor: UIColor { traits in traits.userInterfaceStyle == .dark ? UIColor(red: 0.55, green: 0.85, blue: 0.66, alpha: 1) : UIColor(red: 0.12, green: 0.31, blue: 0.24, alpha: 1) })
    static let paper = Color(uiColor: UIColor { traits in traits.userInterfaceStyle == .dark ? UIColor(red: 0.07, green: 0.10, blue: 0.09, alpha: 1) : UIColor(red: 0.98, green: 0.97, blue: 0.93, alpha: 1) })
    static let yellow = Color(red: 0.98, green: 0.77, blue: 0.28)
}

struct ContentView: View {
    @Environment(QuizStore.self) private var store
    @State private var settings = false
    var body: some View {
        TabView {
            Tab("Today", systemImage: "sparkles") {
                NavigationStack {
                    TodayView()
                        .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Settings", systemImage: "gearshape") { settings = true } } }
                }
            }
            Tab("Your streak", systemImage: "flame") { NavigationStack { HistoryView() } }
        }
        .sheet(isPresented: $settings) { NavigationStack { SettingsView() } }
    }
}

struct TodayView: View {
    @Environment(QuizStore.self) private var store
    @State private var playingQuiz: DailyQuiz?
    @State private var setup = false
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                HStack {
                    Label("\(store.snapshot?.streak.current ?? 0) day streak", systemImage: "flame.fill")
                        .font(.subheadline.weight(.semibold))
                    Spacer()
                    Text(dayLabel(store.localDay)).font(.subheadline).foregroundStyle(.secondary)
                }
                .foregroundStyle(QuizStyle.green)
                if store.isDemo {
                    Label("Demo · sample questions and progress", systemImage: "eye")
                        .font(.caption).foregroundStyle(.secondary)
                }
                HStack(alignment: .center, spacing: 12) {
                    Text("A little more\ncurious.")
                        .font(.system(.largeTitle, design: .serif, weight: .bold))
                        .foregroundStyle(QuizStyle.green)
                    Spacer(minLength: 0)
                    Image("BrandMark").resizable().scaledToFit().frame(width: 88, height: 88)
                        .clipShape(RoundedRectangle(cornerRadius: 20)).accessibilityHidden(true)
                }
                if let quiz = store.todaysQuiz {
                    HostMessageCard(quiz: quiz)
                    VStack(alignment: .leading, spacing: 20) {
                        HStack {
                            Text("TODAY’S FIVE").font(.caption.weight(.bold)).tracking(1)
                            Spacer()
                            Text("\(quiz.answeredCount)/5 answered").font(.caption).foregroundStyle(.secondary)
                        }
                        Text(quiz.title).font(.system(.title2, design: .rounded, weight: .bold))
                        HStack(spacing: 8) {
                            ForEach(quiz.questions) { question in
                                Image(systemName: question.answer == nil ? "circle.dotted" : question.answer?.correct == true ? "checkmark.circle.fill" : "xmark.circle.fill")
                                    .font(.title2)
                                    .foregroundStyle(question.answer == nil ? .secondary : QuizStyle.green)
                                    .accessibilityLabel("Question \(question.index + 1): \(question.answer == nil ? "unanswered" : question.answer!.correct ? "correct" : "incorrect")")
                            }
                            Spacer()
                            if quiz.completed { Text("\(quiz.score)/5").font(.title2.bold()) }
                        }
                        Button { playingQuiz = quiz } label: {
                            HStack {
                                Text(quiz.completed ? "Revisit today’s questions" : quiz.answeredCount == 0 ? "Let’s play" : "Keep going")
                                Spacer(); Image(systemName: "arrow.right")
                            }.font(.headline).padding(.vertical, 8)
                        }
                        .buttonStyle(.borderedProminent).tint(QuizStyle.green)
                        if !quiz.completed {
                            Text("No timer. Just curiosity. Finish all five to keep your streak.")
                                .font(.footnote).foregroundStyle(.secondary)
                        }
                    }
                    .padding(22).background(.background, in: RoundedRectangle(cornerRadius: 24))
                } else {
                    ContentUnavailableView {
                        Label("Your next five are on their way", systemImage: "sparkles")
                    } description: {
                        Text("Connect your agent and ask it to prepare today’s quiz. It can learn your interests and bring you five fresh questions every morning.")
                    } actions: {
                        Button("Connect your agent") { setup = true }.buttonStyle(.borderedProminent)
                        Button("Check for today’s quiz") { Task { await store.refresh() } }
                    }
                    .background(.background, in: RoundedRectangle(cornerRadius: 24))
                }
                if let notice = store.notice {
                    Label(notice, systemImage: "wifi.exclamationmark").font(.footnote).foregroundStyle(.secondary)
                }
                Button { setup = true } label: {
                    Label("Made for you, by your agent", systemImage: "link")
                        .font(.footnote.weight(.medium)).frame(maxWidth: .infinity)
                }
            }
            .padding(24).frame(maxWidth: 620).frame(maxWidth: .infinity)
        }
        .background(QuizStyle.paper)
        .navigationTitle("00Quiz").navigationBarTitleDisplayMode(.inline)
        .refreshable { await store.refresh() }
        .sheet(item: $playingQuiz) { quiz in NavigationStack { QuizPlayView(packID: quiz.id) } }
        .sheet(isPresented: $setup) { NavigationStack { AgentSetupView() } }
    }
}

private struct HostMessageCard: View {
    let quiz: DailyQuiz

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if quiz.completed {
                VStack(alignment: .leading, spacing: 12) {
                    Label("THAT’S A WRAP!", systemImage: "mic.fill")
                        .font(.system(.headline, design: .rounded, weight: .black))
                        .tracking(1)
                        .padding(.horizontal, 18).padding(.vertical, 12)
                        .overlay {
                            RoundedRectangle(cornerRadius: 8).strokeBorder(lineWidth: 2.5)
                        }
                        .overlay {
                            RoundedRectangle(cornerRadius: 5).inset(by: 5).strokeBorder(lineWidth: 0.75)
                        }
                        .rotationEffect(.degrees(-4))
                        .padding(.vertical, 8)
                    Text("All five answered. See you tomorrow.")
                        .font(.subheadline.weight(.medium))
                }
                .foregroundStyle(QuizStyle.green)
                .accessibilityElement(children: .combine)
            }
            Label(quiz.completed ? "YOUR HOST’S OPENING REMARKS" : "A WORD FROM YOUR HOST",
                  systemImage: quiz.completed ? "quote.opening" : "mic.fill")
                .font(.caption.weight(.bold)).tracking(1).foregroundStyle(QuizStyle.green)
            Text(.init(quiz.hostMessage)).font(.body).lineSpacing(4)
        }
        .padding(22).frame(maxWidth: .infinity, alignment: .leading)
        .background(QuizStyle.green.opacity(0.07), in: RoundedRectangle(cornerRadius: 24))
    }
}

struct QuizPlayView: View {
    @Environment(QuizStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let packID: String
    @State private var index = 0
    @State private var selected: Int?
    @State private var errorText: String?
    @State private var results = false
    private var quiz: DailyQuiz? {
        if store.snapshot?.quiz?.id == packID { return store.snapshot?.quiz }
        return store.snapshot?.history.first { $0.id == packID }
    }
    var body: some View {
        ScrollViewReader { proxy in
          ScrollView {
            Color.clear.frame(height: 0).id("quiz-top")
            if let quiz, quiz.questions.indices.contains(index) {
                if results {
                    VStack(spacing: 24) {
                        Image(systemName: "sparkles").font(.system(size: 64)).foregroundStyle(QuizStyle.green)
                        Text("That’s your five.").font(.system(.largeTitle, design: .serif, weight: .bold))
                        Text("\(quiz.score) out of 5").font(.system(.title, design: .rounded, weight: .bold))
                        Text(quiz.score == 5 ? "A clean sweep! Keep that curiosity going." : "Every question is a chance to learn something. You showed up — that’s what builds a streak.")
                            .multilineTextAlignment(.center).foregroundStyle(.secondary)
                        Label("\(store.snapshot?.streak.current ?? 0) day streak", systemImage: "flame.fill").font(.headline).foregroundStyle(QuizStyle.green)
                        Button("Back to today") { dismiss() }.buttonStyle(.borderedProminent)
                    }.padding(32).frame(maxWidth: .infinity)
                } else {
                    questionContent(quiz: quiz, question: quiz.questions[index])
                }
            } else {
                ContentUnavailableView("Quiz unavailable", systemImage: "questionmark.circle", description: Text("Close this screen and refresh to get the latest quiz."))
            }
          }
          .onChange(of: index) { _, _ in proxy.scrollTo("quiz-top", anchor: .top) }
          .onChange(of: results) { _, _ in proxy.scrollTo("quiz-top", anchor: .top) }
        }
        .background(QuizStyle.paper)
        .navigationTitle(results ? "Nicely played" : "Question \(index + 1) of 5")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Close") { dismiss() } } }
        .interactiveDismissDisabled(store.busy)
        .onAppear {
            if quiz?.day == store.localDay, let next = quiz?.questions.firstIndex(where: { $0.answer == nil }) { index = next }
        }
        .alert("Could not save your answer", isPresented: Binding(get: { errorText != nil }, set: { if !$0 { errorText = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(errorText ?? "") }
    }

    private func questionContent(quiz: DailyQuiz, question: QuizQuestion) -> some View {
        VStack(alignment: .leading, spacing: 24) {
            ProgressView(value: Double(index + 1), total: 5).tint(QuizStyle.green)
            Text(question.topic.uppercased()).font(.caption.weight(.bold)).tracking(1.5).foregroundStyle(QuizStyle.green)
            Text(question.prompt).font(.system(.title, design: .serif, weight: .semibold)).fixedSize(horizontal: false, vertical: true)
            VStack(spacing: 12) {
                ForEach(Array(question.choices.enumerated()), id: \.offset) { choiceIndex, choice in
                    let correct = question.correctIndex == choiceIndex
                    let chosen = question.answer?.choiceIndex == choiceIndex
                    Button { selected = choiceIndex } label: {
                        HStack(alignment: .firstTextBaseline, spacing: 14) {
                            Text(String(UnicodeScalar(65 + choiceIndex)!)).font(.subheadline.bold())
                                .frame(width: 30, height: 30).background(QuizStyle.green.opacity(0.08), in: Circle())
                            Text(choice).multilineTextAlignment(.leading).frame(maxWidth: .infinity, alignment: .leading)
                            if correct { Image(systemName: "checkmark.circle.fill").accessibilityLabel("Correct answer") }
                            else if chosen { Image(systemName: "xmark.circle").accessibilityLabel("Your answer, incorrect") }
                            else if selected == choiceIndex && question.answer == nil { Image(systemName: "circle.inset.filled").accessibilityLabel("Selected") }
                        }
                        .foregroundStyle(correct ? QuizStyle.green : Color.primary)
                        .padding(16).frame(maxWidth: .infinity, alignment: .leading)
                        .background(correct ? QuizStyle.green.opacity(0.12) : Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 18))
                        .overlay { RoundedRectangle(cornerRadius: 18).strokeBorder(selected == choiceIndex && question.answer == nil ? QuizStyle.green : Color.clear, lineWidth: 2) }
                    }
                    .buttonStyle(QuizChoiceStyle()).disabled(question.answer != nil || question.correctIndex != nil || store.busy || quiz.day != store.localDay)
                }
            }
            if let explanation = question.explanation {
                VStack(alignment: .leading, spacing: 10) {
                    Label(question.answer.map { $0.correct ? "You got it!" : "A little discovery" } ?? "The answer", systemImage: question.answer?.correct == true ? "checkmark.seal.fill" : "lightbulb.fill")
                        .font(.headline).foregroundStyle(QuizStyle.green)
                    Text(.init(explanation)).lineSpacing(3)
                    if let source = question.sourceURL, let url = URL(string: source), url.scheme == "https" {
                        Link(destination: url) { Label("Explore the source", systemImage: "arrow.up.right") }.font(.footnote)
                    }
                }
                .padding(20).frame(maxWidth: .infinity, alignment: .leading)
                .background(QuizStyle.yellow.opacity(0.18), in: RoundedRectangle(cornerRadius: 20))
                Button(index == 4 ? (quiz.completed ? "See your score" : "Finish review") : "Next question") {
                    if index == 4 { if quiz.completed { results = true } else { dismiss() } }
                    else { index += 1; selected = nil }
                }
                .buttonStyle(.borderedProminent).controlSize(.large).frame(maxWidth: .infinity)
            } else {
                Button {
                    guard let selected else { return }
                    Task {
                        do { try await store.answer(packID: packID, questionIndex: index, choiceIndex: selected) }
                        catch { errorText = "\(error.localizedDescription) If no explanation appears, retry to confirm your selected choice." }
                    }
                } label: {
                    HStack { Spacer(); if store.busy { ProgressView().tint(.white) }; Text("Lock in my answer"); Spacer() }
                }
                .buttonStyle(.borderedProminent).controlSize(.large).disabled(selected == nil || store.busy || quiz.day != store.localDay)
                Text("One choice, then a little more knowledge.").font(.footnote).foregroundStyle(.secondary)
            }
        }
        .padding(24).frame(maxWidth: 620).frame(maxWidth: .infinity)
        .animation(.easeInOut(duration: 0.2), value: question.answer != nil)
    }
}

private struct QuizChoiceStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.opacity(configuration.isPressed ? 0.75 : 1)
    }
}

struct HistoryView: View {
    @Environment(QuizStore.self) private var store
    var body: some View {
        List {
            Section {
                HStack(spacing: 28) {
                    metric("\(store.snapshot?.streak.current ?? 0)", "Current", icon: "flame.fill")
                    metric("\(store.snapshot?.streak.longest ?? 0)", "Best", icon: "trophy")
                    metric("\(store.snapshot?.streak.completedDays ?? 0)", "Played", icon: "checkmark.circle")
                }.frame(maxWidth: .infinity).padding(.vertical, 16)
                Text("Finish all five questions on consecutive days to build a streak. Scores don’t affect it. A missed day resets the streak; today stays open until midnight in your quiz time zone.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            Section("Your quizzes") {
                if let quiz = store.todaysQuiz, quiz.completed { row(quiz) }
                ForEach(store.snapshot?.history ?? []) { row($0) }
                if store.snapshot?.history.isEmpty != false && store.todaysQuiz?.completed != true {
                    Text("Your story starts with today’s five.").foregroundStyle(.secondary)
                }
            }
        }
        .navigationTitle("Your streak")
        .refreshable { await store.refresh() }
    }
    private func metric(_ value: String, _ label: String, icon: String) -> some View {
        VStack(spacing: 6) {
            Image(systemName: icon).foregroundStyle(QuizStyle.green)
            Text(value).font(.system(.largeTitle, design: .rounded, weight: .bold))
            Text(label).font(.caption).foregroundStyle(.secondary)
        }
    }
    private func row(_ quiz: DailyQuiz) -> some View {
        NavigationLink { QuizPlayView(packID: quiz.id) } label: {
            VStack(alignment: .leading, spacing: 5) {
                HStack { Text(dayLabel(quiz.day)).font(.caption).foregroundStyle(.secondary); Spacer(); Text(quiz.completed ? "\(quiz.score)/5" : "\(quiz.answeredCount)/5 answered").font(.caption.bold()) }
                Text(quiz.title).font(.headline)
            }.padding(.vertical, 4)
        }
    }
}
