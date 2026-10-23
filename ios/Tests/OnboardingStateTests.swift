import Foundation

@main struct OnboardingStateTests {
    static func main() {
        let suite = "00quiz-onboarding-tests-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }

        precondition(OnboardingReplay.shouldPresentOnLaunch(hasExistingSession: false, defaults: defaults), "New users need the welcome flow after sign-in")
        OnboardingReplay.complete(defaults: defaults)
        precondition(!OnboardingReplay.shouldPresentOnLaunch(hasExistingSession: true, defaults: defaults))

        let currentLaunch = OnboardingReplay.shouldPresentOnLaunch(hasExistingSession: true, defaults: defaults)
        defaults.set("saved preference", forKey: "existingPreference")
        defaults.set(true, forKey: OnboardingReplay.requestKey)
        precondition(!currentLaunch, "Scheduling a replay must not interrupt the current run")
        precondition(defaults.bool(forKey: OnboardingReplay.requestKey), "The request stays pending until the next process launch")
        precondition(OnboardingReplay.shouldPresentOnLaunch(hasExistingSession: true, defaults: defaults))
        precondition(!defaults.bool(forKey: OnboardingReplay.requestKey), "A launch consumes the one-shot replay request")
        OnboardingReplay.complete(defaults: defaults)
        precondition(!OnboardingReplay.shouldPresentOnLaunch(hasExistingSession: true, defaults: defaults), "Finishing replay must not replay again")
        precondition(defaults.string(forKey: "existingPreference") == "saved preference", "Replaying must preserve saved settings")

        defaults.removeObject(forKey: OnboardingReplay.completedKey)
        precondition(!OnboardingReplay.shouldPresentOnLaunch(hasExistingSession: true, defaults: defaults), "Existing signed-in users must not be forced through new onboarding on upgrade")
        defaults.set(true, forKey: OnboardingReplay.requestKey)
        precondition(OnboardingReplay.shouldPresentOnLaunch(hasExistingSession: false, defaults: defaults), "A requested replay must wait behind sign-in without deleting the request for this run")
        defaults.set(false, forKey: OnboardingReplay.requestKey)
        precondition(!OnboardingReplay.shouldPresentOnLaunch(hasExistingSession: true, defaults: defaults), "Turning off the switch must cancel a pending replay")
        print("PASS: first run, upgrade, deferred replay, one-shot reset, cancellation and preference preservation")
    }
}
