import Foundation

extension DailyQuiz {
    var canPlayWithFriend: Bool {
        completed && questions.count == 5 && Set(questions.map(\.index)).count == 5 &&
        questions.allSatisfy { question in
            guard let answer = question.answer, let key = question.correctIndex else { return false }
            return question.choices.indices.contains(answer.choiceIndex) &&
                question.choices.indices.contains(key) && question.explanation != nil
        }
    }
}

// A value-only session: guest choices never enter QuizStore or its cache/API.
struct FriendQuizSession: Identifiable {
    let id = UUID()
    let ownerQuiz: DailyQuiz
    private(set) var choices: [Int: Int] = [:]

    init?(quiz: DailyQuiz) {
        guard quiz.canPlayWithFriend else { return nil }
        ownerQuiz = quiz
    }

    var completed: Bool { choices.count == ownerQuiz.questions.count }
    var score: Int {
        ownerQuiz.questions.filter { choices[$0.index] == $0.correctIndex }.count
    }

    // Keep the owner's choices and answer keys out of the question UI until
    // this guest has locked an answer, just like the normal quiz experience.
    var quiz: DailyQuiz {
        var quiz = ownerQuiz
        quiz.feedback = nil
        quiz.completed = completed
        quiz.score = score
        quiz.questions = ownerQuiz.questions.map { original in
            var question = original
            if let choice = choices[original.index] {
                question.answer = QuizAnswer(choiceIndex: choice, correct: choice == original.correctIndex, answeredAt: "")
            } else {
                question.answer = nil
                question.correctIndex = nil
                question.explanation = nil
                question.sourceURL = nil
            }
            return question
        }
        return quiz
    }

    @discardableResult mutating func answer(questionIndex: Int, choiceIndex: Int) -> Bool {
        guard choices[questionIndex] == nil,
              let question = ownerQuiz.questions.first(where: { $0.index == questionIndex }),
              question.choices.indices.contains(choiceIndex) else { return false }
        choices[questionIndex] = choiceIndex
        return true
    }
}
