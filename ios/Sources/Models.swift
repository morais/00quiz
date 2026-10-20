import Foundation

struct QuizPreferences: Codable, Equatable {
    var interests: [String] = []
    var language: String? = nil
    var difficulty: String? = nil
    var timeZone = "UTC"
}
struct QuizAnswer: Codable { let choiceIndex: Int; let correct: Bool; let answeredAt: String }
struct QuizFeedback: Codable { let message: String; let updatedAt: String }
struct QuizQuestion: Codable, Identifiable {
    let index: Int
    let prompt: String
    let topic: String
    let choices: [String]
    var correctIndex: Int?
    var explanation: String?
    var sourceURL: String?
    var answer: QuizAnswer?
    var id: Int { index }
}
struct DailyQuiz: Codable, Identifiable {
    let id: String
    let day: String
    let title: String
    let hostMessage: String
    let createdAt: String
    var completed: Bool
    var score: Int
    var questions: [QuizQuestion]
    var feedback: QuizFeedback? = nil
    var answeredCount: Int { questions.filter { $0.answer != nil }.count }
}
struct QuizStreak: Codable { var current: Int; var longest: Int; var completedDays: Int }
struct QuizSnapshot: Codable {
    let today: String
    var preferences: QuizPreferences
    var streak: QuizStreak
    var quiz: DailyQuiz?
    var history: [DailyQuiz]
}
struct MCPConnection: Decodable, Identifiable {
    let id: String
    let clientName: String
    let scopes: [String]
    let connectedAt: String
    let lastUsedAt: String?
    let expiresAt: String
}
enum AppBrand {
    static let name = "00Quiz"
    static let server = URL(string: Bundle.main.object(forInfoDictionaryKey: "QuizServerBaseURL") as? String ?? "https://api.00quiz.com")!
    static var endpoint: String { server.appending(path: "mcp").absoluteString }
    /// Redirects on the website to Claude's prefilled add-connector screen, or to the
    /// directory listing once published. It connects production only, so other servers hide it.
    static var claudeConnectURL: URL? {
        server.host() == "api.00quiz.com" ? URL(string: "https://00quiz.com/claude") : nil
    }
}

func dayLabel(_ day: String) -> String {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = TimeZone(secondsFromGMT: 0)
    formatter.dateFormat = "yyyy-MM-dd"
    guard let date = formatter.date(from: day) else { return day }
    formatter.locale = .current
    formatter.setLocalizedDateFormatFromTemplate("EEE MMM d")
    return formatter.string(from: date)
}
