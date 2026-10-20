import SwiftUI

struct FriendQuizButton: View {
    let quiz: DailyQuiz
    @State private var session: FriendQuizSession?

    var body: some View {
        if quiz.canPlayWithFriend {
            Button { session = FriendQuizSession(quiz: quiz) } label: {
                Label("Let a friend try", systemImage: "person.2.fill")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered).controlSize(.large).tint(QuizStyle.green)
            .sheet(item: $session) { session in
                NavigationStack { FriendQuizView(session: session) }
            }
        }
    }
}

struct FriendQuizView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var session: FriendQuizSession
    @State private var started = false
    @State private var index = 0
    @State private var selected: Int?
    @State private var results = false
    @State private var scrollPosition = ScrollPosition(edge: .top)

    init(session: FriendQuizSession) { _session = State(initialValue: session) }

    var body: some View {
        ScrollView {
            if results && session.completed {
                FriendQuizResultsView(session: session)
                Button("Done") { dismiss() }.buttonStyle(.borderedProminent).controlSize(.large).padding(.bottom, 32)
            } else if !started {
                VStack(spacing: 24) {
                    Image(systemName: "person.2.fill").font(.system(size: 56)).foregroundStyle(QuizStyle.green)
                    Text("Your turn in the spotlight.")
                        .font(.system(.largeTitle, design: .serif, weight: .bold))
                    Text(session.ownerQuiz.title).font(.title3.weight(.semibold))
                    Text("Five questions, one fresh attempt. Take a turn, then hand the phone back to compare scores.")
                        .foregroundStyle(.secondary)
                    Text("Just for fun. This round isn’t saved.").font(.footnote).foregroundStyle(.secondary)
                    Button("I’m ready") { started = true }.buttonStyle(.borderedProminent).controlSize(.large)
                }
                .multilineTextAlignment(.center).padding(32).frame(maxWidth: 620).frame(maxWidth: .infinity)
            } else {
                QuizQuestionView(question: session.quiz.questions[index], number: index + 1,
                                 selected: $selected, nextTitle: index == 4 ? "Compare scores" : "Next question") {
                    if index == 4 { results = true }
                    else { index += 1; selected = nil }
                } onAnswer: { choice in
                    session.answer(questionIndex: session.ownerQuiz.questions[index].index, choiceIndex: choice)
                }
            }
        }
        .scrollPosition($scrollPosition)
        .onChange(of: index) { _, _ in scrollPosition.scrollTo(edge: .top) }
        .onChange(of: results) { _, _ in scrollPosition.scrollTo(edge: .top) }
        .onChange(of: started) { _, _ in scrollPosition.scrollTo(edge: .top) }
        .onChange(of: session.choices.count) { previous, current in
            guard current > previous, !results else { return }
            withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.3)) {
                scrollPosition.scrollTo(edge: .bottom)
            }
        }
        .background(QuizStyle.paper)
        .navigationTitle(results ? "The friendly showdown" : started ? "Friend · \(index + 1) of 5" : "Let a friend try")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Close") { dismiss() } } }
    }
}

struct FriendQuizResultsView: View {
    let session: FriendQuizSession

    private var headline: String {
        if session.score == session.ownerQuiz.score { return "A friendly tie!" }
        return session.score > session.ownerQuiz.score ? "Your friend takes this round!" : "You take this round!"
    }

    var body: some View {
        VStack(spacing: 24) {
            Image(systemName: "hands.clap.fill").font(.system(size: 56)).foregroundStyle(QuizStyle.green)
            Text(headline).font(.system(.largeTitle, design: .serif, weight: .bold)).multilineTextAlignment(.center)
            Text("Same questions. Twice the curiosity.").foregroundStyle(.secondary)
            HStack(spacing: 32) {
                score(session.ownerQuiz.score, label: "You")
                score(session.score, label: "Your friend")
            }
            .padding(24).frame(maxWidth: .infinity)
            .background(QuizStyle.green.opacity(0.07), in: RoundedRectangle(cornerRadius: 24))
            VStack(spacing: 20) {
                HStack(spacing: 12) {
                    Text("Question").frame(maxWidth: .infinity, alignment: .leading)
                    Text("You").frame(width: 48)
                    Text("Friend").frame(width: 48)
                }.font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                ForEach(session.ownerQuiz.questions) { question in
                    HStack(spacing: 12) {
                        Text(question.prompt).font(.subheadline).fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        mark(question.answer?.correct == true, label: "Your answer").frame(width: 48)
                        mark(session.choices[question.index] == question.correctIndex, label: "Friend’s answer").frame(width: 48)
                    }
                }
            }
        }
        .padding(24).frame(maxWidth: 620).frame(maxWidth: .infinity)
    }

    private func score(_ value: Int, label: String) -> some View {
        VStack(spacing: 6) {
            Text("\(value)/5").font(.system(.largeTitle, design: .rounded, weight: .bold)).foregroundStyle(QuizStyle.green)
            Text(label).font(.subheadline)
        }
        .frame(maxWidth: .infinity).accessibilityElement(children: .combine)
    }

    private func mark(_ correct: Bool, label: String) -> some View {
        Image(systemName: correct ? "checkmark.circle.fill" : "xmark.circle")
            .font(.title3).foregroundStyle(correct ? QuizStyle.green : Color.secondary)
            .accessibilityLabel("\(label): \(correct ? "correct" : "incorrect")")
    }
}
