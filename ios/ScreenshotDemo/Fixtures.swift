import Foundation

enum ScreenshotFixtures {
    static let now = ISO8601DateFormatter().date(from: "2026-10-17T09:41:00Z")!
    static var scene: String {
        let args = ProcessInfo.processInfo.arguments
        guard let index = args.firstIndex(of: "--scene"), args.indices.contains(index + 1) else { return "today" }
        return args[index + 1]
    }

    static func snapshot() -> QuizSnapshot {
        var state = DemoData.snapshot()
        state.preferences = QuizPreferences(interests: ["Science", "Space", "Everyday discoveries"], timeZone: "UTC")
        let original = state.quiz!
        state.quiz = DailyQuiz(id: original.id, day: original.day, title: "A world of little wonders",
            hostMessage: "Welcome back! Yesterday you scored 4 out of 5. Today, five little wonders await—from the ocean floor to outer space. Ready?",
            createdAt: original.createdAt, completed: false, score: 0, questions: original.questions)
        state.streak = QuizStreak(current: 7, longest: 14, completedDays: 32)
        for (offset, score) in [(1, 4), (2, 5), (3, 3), (4, 4)] {
            let day = ISO8601DateFormatter().string(from: now.addingTimeInterval(Double(-offset) * 86400)).prefix(10)
            let titles = ["The everyday, explained", "Out of this world", "Small things, big ideas", "A curious mix"]
            state.history.append(complete(DailyQuiz(id: "history-\(offset)", day: String(day), title: titles[offset - 1], hostMessage: "A little curiosity goes a long way.", createdAt: "2026-10-17T07:00:00Z", completed: false, score: 0, questions: state.quiz!.questions), score: score))
        }
        if scene == "explanation" {
            state.quiz?.questions[0].correctIndex = DemoData.keys[0]
            state.quiz?.questions[0].explanation = DemoData.explanations[0]
            state.quiz?.questions[0].answer = QuizAnswer(choiceIndex: DemoData.keys[0], correct: true, answeredAt: "2026-10-17T09:41:00Z")
            state.quiz?.score = 1
        }
        if scene == "completed" || scene == "friend" { state.quiz = complete(state.quiz!, score: 4) }
        return state
    }

    static func complete(_ input: DailyQuiz, score: Int) -> DailyQuiz {
        var quiz = input
        quiz.completed = true; quiz.score = score
        for index in quiz.questions.indices {
            let key = DemoData.keys[index]
            let correct = index < score
            quiz.questions[index].correctIndex = key
            quiz.questions[index].explanation = DemoData.explanations[index]
            quiz.questions[index].answer = QuizAnswer(choiceIndex: correct ? key : (key + 1) % 4, correct: correct, answeredAt: "2026-10-17T09:41:00Z")
        }
        return quiz
    }

    static func friendSession() -> FriendQuizSession {
        var session = FriendQuizSession(quiz: complete(DemoData.snapshot().quiz!, score: 4))!
        for index in 0..<5 {
            session.answer(questionIndex: index, choiceIndex: index == 0 ? (DemoData.keys[index] + 1) % 4 : DemoData.keys[index])
        }
        return session
    }

    @MainActor static func configure(_ store: QuizStore) {
        store.snapshot = snapshot()
        store.isSignedIn = true; store.isDemo = false
        store.connections = []
    }
}
