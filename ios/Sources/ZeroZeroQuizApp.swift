import SwiftUI

@main struct ZeroZeroQuizApp: App {
    @State private var store: QuizStore
    @State private var showOnboarding: Bool
    @Environment(\.scenePhase) private var scenePhase

    init() {
        let store = QuizStore()
        _store = State(initialValue: store)
        _showOnboarding = State(initialValue: OnboardingReplay.shouldPresentOnLaunch(hasExistingSession: store.isSignedIn))
    }

    var body: some Scene {
        WindowGroup {
            Group {
                if !store.isSignedIn { SignInView() }
                else if showOnboarding && !store.isDemo {
                    OnboardingView {
                        OnboardingReplay.complete()
                        showOnboarding = false
                    }
                }
                else { ContentView() }
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
