import SwiftUI

struct OnboardingView: View {
    let onCompleted: () -> Void
    @State private var showingAgent = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    HStack(spacing: 16) {
                        Text("A little more curious.")
                            .font(.system(.largeTitle, design: .serif, weight: .bold))
                            .foregroundStyle(QuizStyle.green)
                        Spacer(minLength: 0)
                        Image("BrandMark").resizable().scaledToFit().frame(width: 88, height: 88)
                            .clipShape(RoundedRectangle(cornerRadius: 20)).accessibilityHidden(true)
                    }
                    feature("Five questions, every day", systemImage: "sparkles",
                            detail: "No timer. Pick an answer, discover something new, then see how you did.")
                    feature("Your agent is your quiz host", systemImage: "mic.fill",
                            detail: "Connect your agent and ask it to prepare your daily five. It chooses topics, language and difficulty unless you set your own preferences.")
                    feature("Keep your curiosity going", systemImage: "flame",
                            detail: "Finish all five to earn a streak day, whatever your score. Afterward, share feedback to steer your next quiz.")
                    Button { showingAgent = true } label: {
                        HStack { Text("Set up my agent"); Spacer(); Image(systemName: "arrow.right") }
                            .quizTapTarget()
                    }
                    .buttonStyle(.borderedProminent).controlSize(.large)
                    .foregroundStyle(QuizStyle.paper)
                    Button(action: onCompleted) { Text("Explore first").frame(maxWidth: .infinity).quizTapTarget() }
                }
                .padding(28).frame(maxWidth: 620).frame(maxWidth: .infinity)
            }
            .background(QuizStyle.paper)
            .navigationTitle("Welcome to 00Quiz").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Skip", action: onCompleted) } }
            .navigationDestination(isPresented: $showingAgent) {
                AgentSetupView()
                    .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done", action: onCompleted) } }
            }
        }
    }

    private func feature(_ title: String, systemImage: String, detail: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(title, systemImage: systemImage).font(.headline).foregroundStyle(QuizStyle.green)
            Text(detail).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
        }
    }
}
