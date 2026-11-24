import React, { useState } from "react";
import { RefreshCw, Send, AlertTriangle } from "lucide-react";
import type {
  ChatTurn,
  HouseholdProfileId,
  PersonalizedGuidance,
  StationReading,
} from "../types/breathewise";

interface GeminiGuidancePanelProps {
  station: StationReading;
  profileId: HouseholdProfileId;
  profileLabel: string;
  guidance: PersonalizedGuidance | null;
  guidanceLoading: boolean;
  guidanceError: string | null;
  onRefreshGuidance: () => void;
  completedRoutines: string[];
}

const SUGGESTED_QUESTIONS = [
  "Is it safe for children to walk to school this morning?",
  "When should we open windows for fresh air during an inversion?",
  "What mask rating filters winter wood smoke and fine PM2.5?",
];

export const GeminiGuidancePanel: React.FC<GeminiGuidancePanelProps> = ({
  station,
  profileId,
  profileLabel,
  guidance,
  guidanceLoading,
  guidanceError,
  onRefreshGuidance,
  completedRoutines,
}) => {
  const [question, setQuestion] = useState("");
  const [chatTurns, setChatTurns] = useState<ChatTurn[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const askAssistant = async (promptText: string) => {
    const trimmed = promptText.trim();
    if (!trimmed || chatLoading) return;

    const userTurn: ChatTurn = {
      id: `u-${Date.now()}`,
      role: "user",
      content: trimmed,
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    setChatTurns((prev) => [...prev, userTurn]);
    setQuestion("");
    setChatError(null);
    setChatLoading(true);

    try {
      const res = await fetch("/api/gemini/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: trimmed,
          stationId: station.id,
          profileId,
          completedRoutines,
        }),
      });
      const data = (await res.json()) as { answer?: string; error?: string };

      if (!res.ok) {
        throw new Error(
          data.error || "Unable to get an answer from BreatheWise."
        );
      }

      const assistantTurn: ChatTurn = {
        id: `a-${Date.now()}`,
        role: "assistant",
        content: data.answer || "",
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
      setChatTurns((prev) => [...prev, assistantTurn]);
    } catch (err) {
      setChatError(
        err instanceof Error ? err.message : "Failed to reach BreatheWise AI."
      );
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
      <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Personalized Guidance for {profileLabel}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {station.district} · AQI{" "}
                <span className="font-mono tabular-nums">{station.aqi}</span> ·{" "}
                {guidance ? `Generated at ${guidance.generatedAt}` : "Gemini 4 Hydrogen"}
              </p>
            </div>
            <button
              type="button"
              onClick={onRefreshGuidance}
              disabled={guidanceLoading}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${guidanceLoading ? "animate-spin" : ""}`}
              />
              {guidanceLoading ? "Updating..." : "Refresh Plan"}
            </button>
          </div>

          {guidanceError && (
            <div className="mt-4 p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-700" />
              <div className="space-y-1">
                <p className="font-medium">AI Guidance Unavailable</p>
                <p className="text-xs text-amber-800">{guidanceError}</p>
              </div>
            </div>
          )}

          {guidanceLoading && !guidance && (
            <div className="mt-5 space-y-4 animate-pulse">
              <div className="h-5 bg-slate-200 rounded w-3/4" />
              <div className="h-16 bg-slate-100 rounded" />
              <div className="h-24 bg-slate-100 rounded" />
            </div>
          )}

          {guidance && (
            <div className="mt-5 space-y-5">
              <div>
                <p className="text-base font-semibold text-slate-900">
                  {guidance.headline}
                </p>
                <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
                  {guidance.outdoorAdvice}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                <div>
                  <p className="text-xs font-medium text-slate-500">
                    Best Lower-Pollution Window
                  </p>
                  <p className="text-sm font-medium text-slate-900 mt-1">
                    {guidance.exposureWindow}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500">
                    Mask & Fit Protocol
                  </p>
                  <p className="text-sm font-medium text-slate-900 mt-1">
                    {guidance.maskGuidance}
                  </p>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <p className="text-xs font-medium text-slate-500 mb-2">
                  Indoor Air Protection Steps
                </p>
                <ul className="space-y-2">
                  {guidance.indoorProtocol.map((step, idx) => (
                    <li
                      key={idx}
                      className="text-sm text-slate-700 flex items-baseline gap-2.5"
                    >
                      <span className="font-mono text-xs text-teal-700 font-semibold shrink-0">
                        0{idx + 1}.
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <p className="text-xs font-medium text-slate-500">
                  Low-Emission Commute & Heating Swap
                </p>
                <p className="text-sm text-slate-700 mt-1">
                  {guidance.commuteRecommendation}
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between">
        <div>
          <div className="pb-4 border-b border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900">
              Ask BreatheWise
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Grounded in {station.district} winter smog telemetry
            </p>
          </div>

          <div className="mt-4 space-y-3 max-h-[290px] overflow-y-auto pr-1">
            {chatTurns.length === 0 ? (
              <div className="space-y-2.5">
                <p className="text-xs text-slate-500">
                  Quick questions for {profileLabel.toLowerCase()}:
                </p>
                {SUGGESTED_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => askAssistant(q)}
                    className="w-full text-left px-3.5 py-2.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors cursor-pointer"
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
                  <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                    <span className="font-medium">
                      {turn.role === "user" ? "You" : "BreatheWise"}
                    </span>
                    <span className="font-mono tabular-nums">
                      {turn.timestamp}
                    </span>
                  </div>
                  <p className="whitespace-pre-line">{turn.content}</p>
                </div>
              ))
            )}

            {chatLoading && (
              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-500">
                Analyzing {station.district} air column data...
              </div>
            )}

            {chatError && (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
                {chatError}
              </div>
            )}
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            askAssistant(question);
          }}
          className="mt-4 pt-4 border-t border-slate-200 flex items-center gap-2"
        >
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask about school play, HEPA sizing, or smoke..."
            aria-label="Ask BreatheWise a winter smog question"
            className="flex-1 min-w-0 px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-700"
          />
          <button
            type="submit"
            disabled={chatLoading || !question.trim()}
            aria-label="Send question"
            className="px-4 py-2.5 bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white rounded-lg text-sm font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Send className="w-4 h-4" />
            Ask
          </button>
        </form>
      </section>
    </div>
  );
};
