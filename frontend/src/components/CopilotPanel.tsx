import { useState } from "react";

import type { CopilotBrief, CopilotReply } from "../lib/types";

export function CopilotPanel({
  title,
  brief,
  reply,
  loading,
  asking,
  error,
  onRefresh,
  onAsk,
}: {
  title: string;
  brief: CopilotBrief | null;
  reply: CopilotReply | null;
  loading: boolean;
  asking: boolean;
  error: string | null;
  onRefresh: () => void;
  onAsk: (question: string) => Promise<void>;
}) {
  const [question, setQuestion] = useState("");
  const [showContextUsed, setShowContextUsed] = useState(false);
  const questionTrimmed = question.trim();
  const questionCharacterCount = question.length;

  async function handleAsk(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = questionTrimmed;
    if (!trimmed) {
      return;
    }
    await onAsk(trimmed);
    setQuestion("");
  }

  async function handleQuickAsk(prompt: string) {
    setQuestion(prompt);
    await onAsk(prompt);
    setQuestion("");
  }

  return (
    <section className="panel copilot-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">OpenAI Copilot</p>
          <h3>{title}</h3>
        </div>
        <button className="secondary-button" onClick={onRefresh} type="button">
          {loading ? "Refreshing..." : "Refresh brief"}
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {brief ? (
        <div className="stack compact">
          <div className="copilot-hero">
            <div>
              <strong>{brief.headline}</strong>
              <p>{brief.summary}</p>
            </div>
            <span className={`priority-pill ${brief.urgency}`}>{brief.generated_by}</span>
          </div>
          <div className="copilot-health">
            <div>
              <span className="eyebrow">AI Health Score</span>
              <strong>{brief.health_score}/100</strong>
              <div
                aria-hidden="true"
                className={`copilot-health-bar ${
                  brief.health_score >= 75
                    ? "good"
                    : brief.health_score >= 45
                      ? "warning"
                      : "critical"
                }`}
              >
                <span style={{ width: `${Math.max(0, Math.min(100, brief.health_score))}%` }} />
              </div>
            </div>
            <span className={`priority-pill ${brief.confidence}`}>
              confidence: {brief.confidence}
            </span>
          </div>
          <div className="signal-row">
            {brief.priorities.map((priority) => (
              <span className="signal-pill" key={priority}>
                {priority}
              </span>
            ))}
          </div>
          {brief.source_signals.length > 0 && (
            <div className="stack compact">
              <button
                className="ghost-button context-toggle"
                onClick={() => setShowContextUsed((current) => !current)}
                type="button"
              >
                Context used {showContextUsed ? "v" : ">"}
              </button>
              {showContextUsed && (
                <div className="signal-row">
                  {brief.source_signals.map((signal) => (
                    <span className="signal-pill" key={signal}>
                      {signal}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
          {brief.quick_prompts.length > 0 && (
            <div className="stack compact">
              <span className="eyebrow">Quick Prompts</span>
              <div className="button-row">
                {brief.quick_prompts.map((prompt) => (
                  <button
                    className="ghost-button quick-prompt-chip"
                    disabled={asking}
                    key={prompt}
                    onClick={() => void handleQuickAsk(prompt)}
                    type="button"
                  >
                    <span>{prompt}</span>
                    <span aria-hidden="true">{">"}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <ul className="action-list">
            {brief.recommended_actions.map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ul>
          {brief.operational_notes.length > 0 && (
            <div className="stack compact">
              {brief.operational_notes.map((note) => (
                <div className="list-card compact-card" key={note}>
                  <p>{note}</p>
                </div>
              ))}
            </div>
          )}
          {brief.rider_message && (
            <div className="helper-box">
              <strong>Suggested rider-facing message</strong>
              <p>{brief.rider_message}</p>
            </div>
          )}
        </div>
      ) : (
        <p className="muted-copy">
          {loading ? "Building an operations brief..." : "No copilot brief yet."}
        </p>
      )}

      <form className="stack ask-form" onSubmit={handleAsk}>
        <label>
          Ask the copilot
          <textarea
            className="copilot-textarea"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="What should I do next to reduce ETA risk?"
          />
        </label>
        <div className="copilot-ask-footer">
          <span className="muted-copy">{questionCharacterCount}/500</span>
        </div>
        <button className="primary-button" disabled={asking || !questionTrimmed} type="submit">
          {asking ? "Thinking..." : "Ask copilot"}
        </button>
      </form>

      {reply && (
        <div className="stack compact">
          <div className="list-card">
            <strong>Copilot answer</strong>
            <p className="copilot-answer-lead">{extractLeadSentence(reply.answer)}</p>
            {extractRemainingAnswer(reply.answer) && (
              <p>{extractRemainingAnswer(reply.answer)}</p>
            )}
          </div>
          {reply.source_signals.length > 0 && (
            <div className="signal-row">
              {reply.source_signals.map((signal) => (
                <span className="signal-pill" key={signal}>
                  {signal}
                </span>
              ))}
            </div>
          )}
          {reply.action_items.length > 0 && (
            <ul className="action-list">
              {reply.action_items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
          {reply.caution && <div className="helper-box">{reply.caution}</div>}
        </div>
      )}
    </section>
  );
}

function extractLeadSentence(answer: string) {
  const trimmed = answer.trim();
  const match = trimmed.match(/^[^.!?]+[.!?]/);
  if (!match) {
    return trimmed;
  }
  return match[0];
}

function extractRemainingAnswer(answer: string) {
  const trimmed = answer.trim();
  const lead = extractLeadSentence(trimmed);
  if (lead.length >= trimmed.length) {
    return "";
  }
  return trimmed.slice(lead.length).trim();
}
