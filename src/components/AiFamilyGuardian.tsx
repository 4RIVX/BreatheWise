import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, RefreshCw, Send } from "lucide-react";
import type { HouseholdContext, StructuredGuidance } from "../domain/schemas";
import type { TranslationBundle } from "../domain/i18n";

export type AiProviderKind = "gemini" | "groq";

export interface AskQuestionResult {
  answer: string;
  provider?: AiProviderKind;
  model?: string;
  fallbackUsed?: boolean;
  fallbackReason?: string | null;
}

export interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  provider?: AiProviderKind;
  model?: string;
  fallbackUsed?: boolean;
  fallbackReason?: string | null;
}

interface AiFamilyGuardianProps {
  locationLabel: string;
  household: HouseholdContext;
  guidance: StructuredGuidance | null;
  guidanceProvider?: AiProviderKind | null;
  guidanceModel: string | null;
  guidanceFallbackReason?: string | null;
  guidanceLoading: boolean;
  guidanceError: string | null;
  onRefreshGuidance: () => void;
  onAskQuestion: (question: string) => Promise<string | AskQuestionResult>;
  t: TranslationBundle;
}

const EXAMPLE_QUESTIONS = [
  "Can my children play outside this afternoon?",
  "Should I open the windows?",
  "How can I reduce indoor pollution without buying an air purifier?",
  "Is cycling recommended under today's conditions?",
  "How can my family plan tomorrow morning?",
];

function formatProviderLabel(
  provider?: AiProviderKind | null,
  model?: string | null,
  fallbackUsed?: boolean
): string {
  if (!model && !provider) return "Gemini primary · Groq fallback";
  const engine =
    provider === "groq" ? (fallbackUsed ? "Groq Fallback" : "Groq") : "Gemini";
  return model ? `${engine} · ${model}` : engine;
}

function renderInlineEmphasis(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={idx} className="font-semibold text-slate-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

export const AiFamilyGuardian: React.FC<AiFamilyGuardianProps> = ({
  locationLabel,
  household,
  guidance,
  guidanceProvider,
  guidanceModel,
  guidanceFallbackReason,
  guidanceLoading,
  guidanceError,
  onRefreshGuidance,
  onAskQuestion,
  t,
}) => {
  const [question, setQuestion] = useState("");
  const [chatTurns, setChatTurns] = useState<ChatTurn[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const turnSeqRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const submitQuestion = async (promptText: string) => {
    const trimmed = promptText.trim();
    if (!trimmed || chatLoading) return;

    turnSeqRef.current += 1;
    const nowTime = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    const userTurn: ChatTurn = {
      id: `u-${turnSeqRef.current}`,
      role: "user",
      content: trimmed,
      timestamp: nowTime,
    };

    setChatTurns((prev) => [...prev, userTurn]);
    setQuestion("");
    setChatError(null);
    setChatLoading(true);

    try {
      const result = await onAskQuestion(trimmed);
      if (!mountedRef.current) return;
      const normalized: AskQuestionResult =
        typeof result === "string" ? { answer: result } : result;
      turnSeqRef.current += 1;
      setChatTurns((prev) => [
        ...prev,
        {
          id: `a-${turnSeqRef.current}`,
          role: "assistant",
          content: normalized.answer,
          timestamp: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          provider: normalized.provider,
          model: normalized.model,
          fallbackUsed: normalized.fallbackUsed,
          fallbackReason: normalized.fallbackReason,
        },
      ]);
    } catch (err) {
      if (!mountedRef.current) return;
      setChatError(
        err instanceof Error
          ? err.message
          : "Unable to get a response from AI Family Guardian."
      );
    } finally {
      if (mountedRef.current) {
        setChatLoading(false);
      }
    }
  };

  return (
    <section
      id="guardian"
      className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch"
    >
      <div
        className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between space-y-5"
        aria-busy={guidanceLoading}
      >
        <div className="space-y-5">
          <div className="pb-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">
                {t.sections.guardianTitle}
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                {locationLabel} · Profile: {household.profileId} ·{" "}
                {formatProviderLabel(
                  guidanceProvider,
                  guidanceModel,
                  Boolean(guidanceFallbackReason)
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={onRefreshGuidance}
              disabled={guidanceLoading}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
            >
              <RefreshCw
                aria-hidden="true"
                className={`w-3.5 h-3.5 ${guidanceLoading ? "animate-spin" : ""}`}
              />
              {guidanceLoading ? "Analyzing..." : t.actions.refreshGuidance}
            </button>
          </div>

          {guidanceFallbackReason && guidance && (
            <div
              role="status"
              className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 leading-relaxed"
            >
              <strong className="text-slate-900">
                Automatic Secondary Fallback Active ({guidanceModel}):
              </strong>{" "}
              {guidanceFallbackReason}
            </div>
          )}

          {guidanceError && (
            <div
              role="alert"
              className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm flex items-start gap-3"
            >
              <AlertTriangle
                aria-hidden="true"
                className="w-4 h-4 mt-0.5 shrink-0 text-amber-700"
              />
              <div className="space-y-1">
                <p className="font-semibold">AI Family Guardian Unavailable</p>
                <p className="text-xs text-amber-800 leading-relaxed">
                  {guidanceError}
                </p>
              </div>
            </div>
          )}

          {guidanceLoading && !guidance && (
            <div className="space-y-3 animate-pulse">
              <div className="h-5 bg-slate-200 rounded w-3/4" />
              <div className="h-16 bg-slate-100 rounded" />
              <div className="h-24 bg-slate-100 rounded" />
            </div>
          )}

          {!guidance && !guidanceLoading && !guidanceError && (
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-600">
              Click <strong>{t.actions.refreshGuidance}</strong> to generate
              structured guidance grounded in the current location&apos;s
              readings and your household profile.
            </div>
          )}

          {guidance && (
            <div className="space-y-5" aria-live="polite">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  {guidance.headline}
                </h3>
                <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
                  {guidance.currentAirQualityExplanation}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                <div>
                  <p className="text-xs font-medium text-slate-600">
                    Outdoor Activity Timing
                  </p>
                  <p className="text-sm text-slate-800 mt-1 leading-relaxed">
                    {guidance.outdoorActivityTiming}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-600">
                    Mask & Respirator Guidance
                  </p>
                  <p className="text-sm text-slate-800 mt-1 leading-relaxed">
                    {guidance.maskGuidance}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                <div>
                  <p className="text-xs font-medium text-slate-600 mb-2">
                    Household Recommendations
                  </p>
                  <ul className="space-y-1.5 text-sm text-slate-700 list-disc pl-4">
                    {guidance.householdRecommendations.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-600 mb-2">
                    Activities to Limit
                  </p>
                  <ul className="space-y-1.5 text-sm text-slate-700 list-disc pl-4">
                    {guidance.activitiesToLimit.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 space-y-2">
                <p className="text-xs font-medium text-slate-600">
                  Indoor Protection & Commuting
                </p>
                <ul className="space-y-1.5 text-sm text-slate-700 list-disc pl-4">
                  {guidance.indoorProtectionSteps.map((step, idx) => (
                    <li key={idx}>{step}</li>
                  ))}
                </ul>
                <p className="text-sm text-slate-700 pt-1">
                  <strong>Commuting:</strong>{" "}
                  {guidance.commutingRecommendations}
                </p>
              </div>

              <div className="pt-4 border-t border-slate-100 space-y-2">
                <p className="text-xs font-medium text-slate-600">
                  Next 24-Hour Action Plan & Reasoning
                </p>
                <ol className="space-y-1.5 text-sm text-slate-700 list-decimal pl-4">
                  {guidance.next24HourActionPlan.map((step, idx) => (
                    <li key={idx}>{step}</li>
                  ))}
                </ol>
                <div className="pt-2 space-y-1.5">
                  {guidance.recommendationExplanations.map((rat, idx) => (
                    <p key={idx} className="text-xs text-slate-600">
                      <strong className="text-slate-800">
                        {rat.recommendation}:
                      </strong>{" "}
                      {rat.whyItMatters}
                    </p>
                  ))}
                </div>
              </div>

              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5 text-xs text-slate-600">
                <p>
                  <strong className="text-slate-800">Data Limitations:</strong>{" "}
                  {guidance.dataLimitationsAndUncertainty}
                </p>
                <p>
                  <strong className="text-slate-800">
                    Medical Safety Note:
                  </strong>{" "}
                  {guidance.medicalSafetyNote}
                </p>
              </div>
            </div>
          )}
        </div>

        <p className="text-xs text-slate-600 pt-3 border-t border-slate-100">
          {t.disclaimers.medicalNote}
        </p>
      </div>

      {/* Interactive Q&A */}
      <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between">
        <div>
          <div className="pb-4 border-b border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900">
              Interactive AI Q&amp;A
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Ask questions grounded in {locationLabel} air quality and your
              household profile.
            </p>
          </div>

          <div
            aria-live="polite"
            className="mt-4 space-y-3 max-h-[420px] overflow-y-auto pr-1"
          >
            {chatTurns.length === 0 ? (
              <div className="space-y-2">
                <p className="text-xs text-slate-600">
                  Suggested family questions:
                </p>
                {EXAMPLE_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => submitQuestion(q)}
                    className="w-full text-left px-3.5 py-2.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
                  >
                    {q}
                  </button>
                ))}
              </div>
            ) : (
              chatTurns.map((turn) => (
                <div
                  key={turn.id}
                  className={`p-3.5 rounded-lg text-sm leading-relaxed ${
                    turn.role === "user"
                      ? "bg-slate-100 text-slate-900 ml-6"
                      : "bg-teal-50/70 border border-teal-200/80 text-slate-800 mr-4"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-[11px] text-slate-600 mb-1">
                    <span className="font-medium">
                      {turn.role === "user"
                        ? "You"
                        : `AI Family Guardian (${formatProviderLabel(turn.provider, turn.model, turn.fallbackUsed)})`}
                    </span>
                    <span className="font-mono tabular-nums">
                      {turn.timestamp}
                    </span>
                  </div>
                  {turn.fallbackReason && (
                    <p className="text-[11px] text-slate-600 mb-1.5">
                      {turn.fallbackReason}
                    </p>
                  )}
                  <p className="whitespace-pre-line">
                    {renderInlineEmphasis(turn.content)}
                  </p>
                </div>
              ))
            )}

            {chatLoading && (
              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
                Checking verified measurements and forecast for {locationLabel}
                ...
              </div>
            )}

            {chatError && (
              <div
                role="alert"
                className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900"
              >
                {chatError}
              </div>
            )}
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitQuestion(question);
          }}
          className="mt-4 pt-4 border-t border-slate-200 flex items-center gap-2"
        >
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask about outdoor play, windows, masks..."
            aria-label="Ask AI Family Guardian a question"
            className="flex-1 min-w-0 px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:border-teal-700"
          />
          <button
            type="submit"
            disabled={chatLoading || !question.trim()}
            className="px-4 py-2.5 bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white rounded-lg text-sm font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
          >
            <Send aria-hidden="true" className="w-4 h-4" />
            {t.actions.askAi}
          </button>
        </form>
      </div>
    </section>
  );
};
