import React, { useMemo, useState } from "react";
import { calculateIndoorAirMetrics, type CadrUnit } from "../domain/indoorAir";
import type { TranslationBundle } from "../domain/i18n";

interface IndoorAirCoachProps {
  locationLabel: string;
  purifierCadrM3h: number;
  onChangePurifierCadrM3h: (m3h: number) => void;
  t: TranslationBundle;
}

const INDOOR_GUIDANCE_ITEMS = [
  {
    title: "Reduce Indoor Pollution Sources First",
    detail:
      "Source control is more effective than filtration alone. Avoid smoking indoors, reduce unvented incense/mosquito-coil combustion, and minimize dry sweeping that resuspends fine dust.",
  },
  {
    title: "Ventilated Kitchen Exhaust During Cooking",
    detail:
      "Use a ducted kitchen chimney or exhaust fan whenever frying, roasting, or tempering spices to remove ultrafine PM2.5 and NO2 directly at the stove.",
  },
  {
    title: "HEPA Filtration & Filter Maintenance",
    detail:
      "Select true HEPA (H13/H14) purifiers sized to deliver your target ACH at an acceptable noise level, and replace/vacuum pre-filters per manufacturer schedules. Strictly avoid ozone-generating purifiers or ionizers.",
  },
  {
    title: "Time Natural Ventilation Against Outdoor Air Quality",
    detail:
      "Check both measured CPCB stations and regional wind forecasts before opening windows. When outdoor particulate levels are high, keep doors/windows sealed and rely on recirculation filtration.",
  },
];

export const IndoorAirCoach: React.FC<IndoorAirCoachProps> = ({
  locationLabel,
  purifierCadrM3h,
  onChangePurifierCadrM3h,
  t,
}) => {
  const [lengthM, setLengthM] = useState<number>(5.0);
  const [widthM, setWidthM] = useState<number>(4.0);
  const [heightM, setHeightM] = useState<number>(2.9);
  const [cadrUnit, setCadrUnit] = useState<CadrUnit>("m3h");
  const [cadrInput, setCadrInput] = useState<number>(
    purifierCadrM3h > 0 ? purifierCadrM3h : 300
  );
  const [desiredAch, setDesiredAch] = useState<number>(5);

  const metrics = useMemo(() => {
    try {
      return calculateIndoorAirMetrics({
        lengthM,
        widthM,
        heightM,
        purifierCadr: cadrInput,
        cadrUnit,
        desiredAch,
      });
    } catch {
      return null;
    }
  }, [lengthM, widthM, heightM, cadrInput, cadrUnit, desiredAch]);

  const handleCadrInputChange = (val: number) => {
    const safe = Math.max(0, Math.min(2500, val));
    setCadrInput(safe);
    onChangePurifierCadrM3h(
      cadrUnit === "cfm" ? Math.round(safe * 1.699) : Math.round(safe)
    );
  };

  const handleUnitToggle = (nextUnit: CadrUnit) => {
    if (nextUnit === cadrUnit) return;
    if (nextUnit === "cfm") {
      setCadrInput(Math.round(cadrInput / 1.699));
    } else {
      setCadrInput(Math.round(cadrInput * 1.699));
    }
    setCadrUnit(nextUnit);
  };

  return (
    <section
      id="indoor"
      className="bg-white border border-slate-200 rounded-xl p-6 space-y-6"
    >
      <div className="pb-5 border-b border-slate-200 flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            {t.sections.indoorTitle}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Transparent room-volume, CADR, and Air Changes per Hour (ACH)
            calculator for {locationLabel}.
          </p>
        </div>

        <div
          role="group"
          aria-label="CADR input units"
          className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg"
        >
          <button
            type="button"
            onClick={() => handleUnitToggle("m3h")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              cadrUnit === "m3h"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            CADR in m³/h
          </button>
          <button
            type="button"
            onClick={() => handleUnitToggle("cfm")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              cadrUnit === "cfm"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            CADR in CFM
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-6 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label
                htmlFor="room-length-input"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Length (m)
              </label>
              <input
                id="room-length-input"
                type="number"
                min={1}
                max={30}
                step={0.1}
                value={lengthM}
                onChange={(e) =>
                  setLengthM(Math.max(1, Number(e.target.value) || 1))
                }
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-700"
              />
            </div>

            <div>
              <label
                htmlFor="room-width-input"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Width (m)
              </label>
              <input
                id="room-width-input"
                type="number"
                min={1}
                max={30}
                step={0.1}
                value={widthM}
                onChange={(e) =>
                  setWidthM(Math.max(1, Number(e.target.value) || 1))
                }
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-700"
              />
            </div>

            <div>
              <label
                htmlFor="room-height-input"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Height (m)
              </label>
              <input
                id="room-height-input"
                type="number"
                min={1.8}
                max={10}
                step={0.1}
                value={heightM}
                onChange={(e) =>
                  setHeightM(Math.max(1.8, Number(e.target.value) || 2.5))
                }
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-700"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="purifier-cadr-input"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Purifier CADR ({cadrUnit === "cfm" ? "CFM" : "m³/h"})
              </label>
              <input
                id="purifier-cadr-input"
                type="number"
                min={0}
                max={2500}
                step={10}
                value={cadrInput}
                onChange={(e) =>
                  handleCadrInputChange(Number(e.target.value) || 0)
                }
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-700"
              />
            </div>

            <div>
              <label
                htmlFor="desired-ach-select"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Desired Air Changes / Hour
              </label>
              <select
                id="desired-ach-select"
                value={desiredAch}
                onChange={(e) => setDesiredAch(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-700"
              >
                <option value={3}>3 ACH (Light maintenance)</option>
                <option value={4}>4 ACH (Moderate pollution)</option>
                <option value={5}>5 ACH (Poor / High PM2.5)</option>
                <option value={6}>6 ACH (Severe smog episodes)</option>
              </select>
            </div>
          </div>

          {metrics && (
            <div className="pt-4 border-t border-slate-200 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-slate-500">Room Volume</p>
                  <p className="text-2xl font-mono font-semibold tabular-nums text-slate-900 mt-1">
                    {metrics.roomVolumeM3}{" "}
                    <span className="text-xs font-normal">m³</span>
                  </p>
                  <p className="text-[11px] font-mono tabular-nums text-slate-500">
                    {metrics.roomFloorAreaM2} m² floor
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-500">Required CADR</p>
                  <p className="text-2xl font-mono font-semibold tabular-nums text-slate-900 mt-1">
                    {metrics.requiredCadrM3h}{" "}
                    <span className="text-xs font-normal">m³/h</span>
                  </p>
                  <p className="text-[11px] font-mono tabular-nums text-slate-500">
                    {metrics.requiredCadrCfm} CFM
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-500">Effective ACH</p>
                  <p
                    className={`text-2xl font-mono font-semibold tabular-nums mt-1 ${
                      metrics.meetsDesiredAch
                        ? "text-emerald-700"
                        : "text-amber-700"
                    }`}
                  >
                    {metrics.effectiveAch}{" "}
                    <span className="text-xs font-normal">ACH</span>
                  </p>
                  <p className="text-[11px] text-slate-600">
                    {metrics.meetsDesiredAch
                      ? "Meets target"
                      : `Short by ${metrics.cadrGapM3h} m³/h`}
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-mono text-slate-700 space-y-1">
                <p>Volume = {metrics.formulas.volume}</p>
                <p>Required CADR = {metrics.formulas.requiredCadr}</p>
                <p>Effective ACH = {metrics.formulas.effectiveAch}</p>
                <p className="text-slate-500">
                  {metrics.formulas.unitConversion}
                </p>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                <strong>Calculator Scope:</strong> {metrics.disclaimer}
              </p>
            </div>
          )}
        </div>

        <div className="lg:col-span-6 divide-y divide-slate-100 border-t lg:border-t-0 lg:border-l border-slate-200 lg:pl-8">
          {INDOOR_GUIDANCE_ITEMS.map((item, idx) => (
            <div key={item.title} className={idx === 0 ? "pb-4" : "py-4"}>
              <p className="text-sm font-semibold text-slate-900">
                <span className="font-mono text-xs text-teal-800 mr-2">
                  0{idx + 1}.
                </span>
                {item.title}
              </p>
              <p className="text-sm text-slate-600 mt-1.5 pl-6 leading-relaxed">
                {item.detail}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
