import Foundation

enum OnboardingReplay {
    static let requestKey = "onboarding.replayOnNextLaunch"
    static let completedKey = "onboarding.completed"

    // Consume once at process launch, as in 00Food. Foregrounding or opening
    // another window must not turn the developer switch into an immediate replay.
    static func shouldPresentOnLaunch(hasExistingSession: Bool, defaults: UserDefaults = .standard) -> Bool {
        let replay = defaults.bool(forKey: requestKey)
        if replay { defaults.set(false, forKey: requestKey) }
        // Existing users already completed the original sign-in/setup flow.
        if hasExistingSession && defaults.object(forKey: completedKey) == nil {
            defaults.set(true, forKey: completedKey)
        }
        return replay || !defaults.bool(forKey: completedKey)
    }

    static func complete(defaults: UserDefaults = .standard) {
        defaults.set(true, forKey: completedKey)
    }
}
