import React from "react";
import type { TranslationBundle } from "../domain/i18n";

export type SectionId =
  "dashboard" | "guardian" | "planner" | "indoor" | "mobility" | "smog-watch";

interface HeaderProps {
  activeSection: SectionId;
  onNavigate: (section: SectionId) => void;
  onOpenReportModal: () => void;
  t: TranslationBundle;
}

export const Header: React.FC<HeaderProps> = ({
  activeSection,
  onNavigate,
  onOpenReportModal,
  t,
}) => {
  const navItems: { id: SectionId; label: string }[] = [
    { id: "dashboard", label: t.nav.dashboard },
    { id: "guardian", label: t.nav.guardian },
    { id: "indoor", label: t.nav.indoor },
    { id: "mobility", label: t.nav.mobility },
    { id: "smog-watch", label: t.nav.smogWatch },
  ];

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-slate-200">
      <div className="max-w-[1280px] mx-auto px-6 h-16 flex items-center justify-between gap-8">
        <a
          href="#dashboard"
          onClick={(e) => {
            e.preventDefault();
            onNavigate("dashboard");
          }}
          className="text-xl font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700"
        >
          {t.brand}
        </a>

        <nav
          aria-label="Primary navigation"
          className="hidden md:flex items-center gap-6"
        >
          {navItems.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={isActive ? "location" : undefined}
                onClick={() => onNavigate(item.id)}
                className={`min-h-11 py-1.5 text-sm font-medium whitespace-nowrap shrink-0 border-b-2 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700 ${
                  isActive
                    ? "border-teal-700 text-slate-900"
                    : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onOpenReportModal}
            className="min-h-11 px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
          >
            {t.actions.reportSmog}
          </button>
        </div>
      </div>

      <nav
        aria-label="Mobile navigation"
        className="flex md:hidden items-center gap-3.5 px-4 py-2 border-t border-slate-100 overflow-x-auto"
      >
        {navItems.map((item) => {
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-current={isActive ? "location" : undefined}
              onClick={() => onNavigate(item.id)}
              className={`min-h-11 py-1 text-xs font-medium whitespace-nowrap shrink-0 border-b-2 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${
                isActive
                  ? "border-teal-700 text-slate-900"
                  : "border-transparent text-slate-600"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
};
