import SwiftUI

@main struct ScreenshotDemoApp: App {
    @State private var store = QuizStore()
    var body: some Scene {
        WindowGroup {
            Group {
                switch ScreenshotFixtures.scene {
                case "question", "explanation": NavigationStack { QuizPlayView(packID: store.snapshot!.quiz!.id) }
                case "history": NavigationStack { HistoryView() }
                case "friend": NavigationStack { FriendQuizView(session: ScreenshotFixtures.friendSession()) }
                case "preferences": NavigationStack { PreferencesView() }
                case "setup": NavigationStack { AgentSetupView() }
                case "sign-in": SignInView()
                default: ContentView()
                }
            }
            .environment(store).tint(QuizStyle.green)
            .preferredColorScheme(.light)
        }
    }
}
