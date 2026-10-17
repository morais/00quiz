import SwiftUI

@main struct ZeroZeroQuizApp: App {
    @State private var store = QuizStore()
    @Environment(\.scenePhase) private var scenePhase
    var body: some Scene {
        WindowGroup {
            Group {
                if store.isSignedIn { ContentView() } else { SignInView() }
            }
            .environment(store)
            .tint(QuizStyle.green)
            .task(id: "\(scenePhase)-\(store.isSignedIn)-\(store.isDemo)") {
                guard scenePhase == .active, store.isSignedIn, !store.isDemo else { return }
                while !Task.isCancelled {
                    await store.refresh()
                    try? await Task.sleep(for: .seconds(30))
                }
            }
        }
    }
}
