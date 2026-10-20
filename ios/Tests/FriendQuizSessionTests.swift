import Foundation

// Run with the command in ios/README.md; no simulator or test account needed.
@main struct FriendQuizSessionTests {
    static func main() throws {
        var original = DemoData.snapshot().quiz!
        precondition(FriendQuizSession(quiz: original) == nil, "Unfinished quizzes must not allow guest play")
        original.completed = true
        precondition(FriendQuizSession(quiz: original) == nil, "A completion flag alone must not expose answer keys")

        for index in original.questions.indices {
            let choice = index == 4 ? (DemoData.keys[index] + 1) % 4 : DemoData.keys[index]
            original.questions[index].answer = QuizAnswer(choiceIndex: choice, correct: choice == DemoData.keys[index], answeredAt: "owner-answer")
            original.questions[index].correctIndex = DemoData.keys[index]
            original.questions[index].explanation = DemoData.explanations[index]
            original.questions[index].sourceURL = "https://example.com/source"
        }
        original.score = 4
        original.feedback = QuizFeedback(message: "More nature, please.", updatedAt: "owner-feedback")
        let encoder = JSONEncoder(); encoder.outputFormatting = .sortedKeys
        let originalBytes = try encoder.encode(original)
        var legacy = try JSONSerialization.jsonObject(with: originalBytes) as! [String: Any]
        legacy.removeValue(forKey: "feedback")
        let legacyQuiz = try JSONDecoder().decode(DailyQuiz.self, from: JSONSerialization.data(withJSONObject: legacy))
        precondition(legacyQuiz.feedback == nil, "Cached quizzes from before feedback must remain readable")
        var guest = FriendQuizSession(quiz: original)!
        precondition(guest.quiz.feedback == nil, "Owner preference notes must stay out of a friend's round")
        precondition(guest.score == 0 && !guest.completed && guest.quiz.answeredCount == 0)
        precondition(guest.quiz.questions.allSatisfy { $0.answer == nil && $0.correctIndex == nil && $0.explanation == nil && $0.sourceURL == nil }, "Guest questions must hide owner answers and feedback")

        precondition(!guest.answer(questionIndex: -1, choiceIndex: 0))
        precondition(!guest.answer(questionIndex: 0, choiceIndex: -1))
        precondition(!guest.answer(questionIndex: 0, choiceIndex: 4))
        precondition(guest.choices.isEmpty, "Invalid input must not count as an answer")
        precondition(guest.answer(questionIndex: 0, choiceIndex: (DemoData.keys[0] + 1) % 4))
        precondition(!guest.answer(questionIndex: 0, choiceIndex: DemoData.keys[0]), "A locked guest answer must remain final")
        precondition(guest.score == 0 && guest.quiz.answeredCount == 1 && !guest.completed)
        precondition(guest.quiz.questions[0].answer?.correct == false)
        precondition(guest.quiz.questions[0].explanation == DemoData.explanations[0])
        precondition(guest.quiz.questions.dropFirst().allSatisfy { $0.correctIndex == nil && $0.answer == nil }, "Answering one question must not reveal the next")

        for index in 1..<5 { precondition(guest.answer(questionIndex: index, choiceIndex: DemoData.keys[index])) }
        precondition(guest.completed && guest.score == 4 && guest.quiz.answeredCount == 5)
        let ownerAfter = try encoder.encode(original)
        let comparisonOwner = try encoder.encode(guest.ownerQuiz)
        precondition(ownerAfter == originalBytes, "Guest play must not change the owner's quiz")
        precondition(comparisonOwner == originalBytes, "The comparison must retain the original owner result")
        let another = FriendQuizSession(quiz: original)!
        precondition(another.id != guest.id && another.score == 0 && another.choices.isEmpty, "Each friend must get a fresh run")

        var perfect = another
        var zero = another
        for index in 0..<5 {
            perfect.answer(questionIndex: index, choiceIndex: DemoData.keys[index])
            zero.answer(questionIndex: index, choiceIndex: (DemoData.keys[index] + 1) % 4)
        }
        precondition(perfect.completed && perfect.score == 5)
        precondition(zero.completed && zero.score == 0, "Completion must be independent of score")

        var zeroOwner = original; zeroOwner.score = 0
        for index in zeroOwner.questions.indices {
            zeroOwner.questions[index].answer = QuizAnswer(choiceIndex: (DemoData.keys[index] + 1) % 4, correct: false, answeredAt: "owner-answer")
        }
        precondition(FriendQuizSession(quiz: zeroOwner) != nil, "The owner's score must not prevent a friend from trying")

        var missingKey = original; missingKey.questions[0].correctIndex = nil
        precondition(FriendQuizSession(quiz: missingKey) == nil)
        var missingExplanation = original; missingExplanation.questions[0].explanation = nil
        precondition(FriendQuizSession(quiz: missingExplanation) == nil)
        var invalidKey = original; invalidKey.questions[0].correctIndex = 9
        precondition(FriendQuizSession(quiz: invalidKey) == nil)
        print("PASS: guest eligibility, hidden answers, single attempts, score extremes, completion, fresh runs and owner isolation")
    }
}
