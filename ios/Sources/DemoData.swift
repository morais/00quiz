import Foundation

enum DemoData {
    static let keys = [1, 2, 0, 3, 1]
    static let explanations = [
        "Octopuses have three hearts. Two pump blood through the gills; one supplies the rest of the body.",
        "Venus rotates so slowly that one rotation takes longer than its trip around the Sun.",
        "The word ‘algorithm’ comes from the name of the mathematician al-Khwarizmi.",
        "A keystone is the central stone at the top of an arch, locking the surrounding stones in place.",
        "Sound needs a medium to travel through. Space is mostly a vacuum, so sound cannot travel across it."
    ]
    static func snapshot() -> QuizSnapshot {
        let formatter = DateFormatter(); formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.dateFormat = "yyyy-MM-dd"
        let day = formatter.string(from: .now)
        let prompts = ["How many hearts does an octopus have?", "On which planet is a day longer than a year?", "Whose name gave us the word ‘algorithm’?", "What holds a traditional stone arch together?", "Why can’t sound travel through empty space?"]
        let choices = [["One", "Three", "Two", "Four"], ["Mars", "Jupiter", "Venus", "Mercury"], ["Al-Khwarizmi", "Euclid", "Ada Lovelace", "Archimedes"], ["A cornerstone", "A lintel", "A buttress", "A keystone"], ["It is too cold", "There is no medium", "Gravity stops it", "Light absorbs it"]]
        let topics = ["Nature", "Space", "Technology", "Architecture", "Science"]
        let questions = (0..<5).map { QuizQuestion(index: $0, prompt: prompts[$0], topic: topics[$0], choices: choices[$0]) }
        let quiz = DailyQuiz(id: "demo", day: day, title: "A world of little wonders", hostMessage: "Welcome back, curious mind. Yesterday you went 4 for 5 — nicely done! Today we’re heading from the ocean floor to outer space. Let’s see what surprises you.", createdAt: ISO8601DateFormatter().string(from: .now), completed: false, score: 0, questions: questions)
        return QuizSnapshot(today: day, preferences: QuizPreferences(timeZone: TimeZone.current.identifier), streak: QuizStreak(current: 3, longest: 4, completedDays: 11), quiz: quiz, history: [])
    }
}
