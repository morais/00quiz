import SwiftUI

struct QuizQuestionView: View {
    let question: QuizQuestion
    let number: Int
    @Binding var selected: Int?
    var isBusy = false
    var canAnswer = true
    let nextTitle: String
    let onNext: () -> Void
    let onAnswer: (Int) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            ProgressView(value: Double(number), total: 5).tint(QuizStyle.green)
            Text(question.topic.uppercased()).font(.caption.weight(.bold)).tracking(1.5).foregroundStyle(QuizStyle.green)
            Text(question.prompt).font(.system(.title, design: .serif, weight: .semibold)).fixedSize(horizontal: false, vertical: true)
            VStack(spacing: 12) {
                ForEach(Array(question.choices.enumerated()), id: \.offset) { choiceIndex, choice in
                    let correct = question.correctIndex == choiceIndex
                    let chosen = question.answer?.choiceIndex == choiceIndex
                    Button { selected = choiceIndex } label: {
                        HStack(alignment: .firstTextBaseline, spacing: 14) {
                            Text(String(UnicodeScalar(65 + choiceIndex)!)).font(.subheadline.bold())
                                .frame(width: 30, height: 30).background(QuizStyle.green.opacity(0.08), in: Circle())
                            Text(choice).multilineTextAlignment(.leading).frame(maxWidth: .infinity, alignment: .leading)
                            if correct { Image(systemName: "checkmark.circle.fill").accessibilityLabel("Correct answer") }
                            else if chosen { Image(systemName: "xmark.circle").accessibilityLabel("Your answer, incorrect") }
                            else if selected == choiceIndex && question.answer == nil { Image(systemName: "circle.inset.filled").accessibilityLabel("Selected") }
                        }
                        .foregroundStyle(correct ? QuizStyle.green : Color.primary)
                        .padding(16).frame(maxWidth: .infinity, alignment: .leading)
                        .background(correct ? QuizStyle.green.opacity(0.12) : Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 18))
                        .overlay { RoundedRectangle(cornerRadius: 18).strokeBorder(selected == choiceIndex && question.answer == nil ? QuizStyle.green : Color.clear, lineWidth: 2) }
                    }
                    .buttonStyle(QuizChoiceStyle()).disabled(question.answer != nil || question.correctIndex != nil || isBusy || !canAnswer)
                }
            }
            if let explanation = question.explanation {
                VStack(alignment: .leading, spacing: 10) {
                    Label(question.answer.map { $0.correct ? "You got it!" : "A little discovery" } ?? "The answer", systemImage: question.answer?.correct == true ? "checkmark.seal.fill" : "lightbulb.fill")
                        .font(.headline).foregroundStyle(QuizStyle.green)
                    Text(.init(explanation)).lineSpacing(3)
                    if let source = question.sourceURL, let url = URL(string: source), url.scheme == "https" {
                        Link(destination: url) { Label("Explore the source", systemImage: "arrow.up.right") }.font(.footnote)
                    }
                }
                .padding(20).frame(maxWidth: .infinity, alignment: .leading)
                .background(QuizStyle.yellow.opacity(0.18), in: RoundedRectangle(cornerRadius: 20))
                Button(nextTitle, action: onNext)
                    .buttonStyle(.borderedProminent).controlSize(.large).frame(maxWidth: .infinity)
            } else {
                Button {
                    guard let selected else { return }
                    onAnswer(selected)
                } label: {
                    HStack { Spacer(); if isBusy { ProgressView().tint(.white) }; Text("Lock in my answer"); Spacer() }
                }
                .buttonStyle(.borderedProminent).controlSize(.large).disabled(selected == nil || isBusy || !canAnswer)
                Text("One choice, then a little more knowledge.").font(.footnote).foregroundStyle(.secondary)
            }
        }
        .padding(24).frame(maxWidth: 620).frame(maxWidth: .infinity)
        .animation(.easeInOut(duration: 0.2), value: question.answer != nil)
    }
}

private struct QuizChoiceStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.opacity(configuration.isPressed ? 0.75 : 1)
    }
}
