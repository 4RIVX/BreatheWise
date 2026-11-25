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
      "Source control is substantially more effective than filtration alone. Eliminate indoor smoking, minimize unvented incense and mosquito coil burning, avoid unvented kerosene heaters, and avoid dry sweeping that resuspends settled dust.",
  },
  {
    title: "Kitchen Exhaust & Localized Ventilation",
    detail:
      "Operate a dedicated ducted kitchen chimney or high-flow exhaust fan during all frying, roasting, and tempering. Cooking produces high peaks of ultrafine PM2.5, acrolein, and NO2 that must be expelled at the source.",
  },
  {
    title: "HEPA Limits, Activated Carbon & CO Safety",
    detail:
      "True HEPA (H13/H14) mechanical filters trap airborne particulates (PM2.5, PM10, allergens, combustion soot) at ≥99.97% efficiency at 0.3 microns, but do NOT capture gases, VOCs, formaldehyde, ozone, or carbon monoxide (CO). Activated carbon can adsorb certain gases and VOCs depending on the sorbent medium, bed mass, and remaining capacity, but ordinary portable activated-carbon purifiers do NOT reliably remove carbon monoxide (CO). Install certified CO alarms and maintain combustion-source safety with outdoor-vented stoves, chimneys, and heaters. Avoid electronic ionizers, plasma cleaners, or ozone generators that release airway irritants.",
  },
  {
    title: "Purifier Sizing (ACH) & Real-World Clean Air",
    detail:
      "During outdoor smog episodes, keep exterior windows closed and use 3–6 ACH options strictly as illustrative purifier-sizing benchmarks for enclosed rooms rather than universal medical rules. Real-world effective clean-air delivery depends on purifier performance, room air leakage, unit placement, filter condition, and room air mixing. Open windows for natural cross-ventilation only when current verified air-quality and local visibility conditions show clean outdoor air rather than on a fixed schedule.",
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
          <p className="text-sm text-slate-600 mt-1">
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
            aria-pressed={cadrUnit === "m3h"}
            onClick={() => handleUnitToggle("m3h")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${
              cadrUnit === "m3h"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-700 hover:text-slate-900"
            }`}
          >
            CADR in m³/h
          </button>
          <button
            type="button"
            aria-pressed={cadrUnit === "cfm"}
            onClick={() => handleUnitToggle("cfm")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${
              cadrUnit === "cfm"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-700 hover:text-slate-900"
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
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:border-teal-700"
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
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:border-teal-700"
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
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:border-teal-700"
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
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:border-teal-700"
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
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:border-teal-700"
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
                  <p className="text-xs text-slate-600">Room Volume</p>
                  <p className="text-2xl font-mono font-semibold tabular-nums text-slate-900 mt-1">
                    {metrics.roomVolumeM3}{" "}
                    <span className="text-xs font-normal">m³</span>
                  </p>
                  <p className="text-[11px] font-mono tabular-nums text-slate-600">
                    {metrics.roomFloorAreaM2} m² floor
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-600">Required CADR</p>
                  <p className="text-2xl font-mono font-semibold tabular-nums text-slate-900 mt-1">
                    {metrics.requiredCadrM3h}{" "}
                    <span className="text-xs font-normal">m³/h</span>
                  </p>
                  <p className="text-[11px] font-mono tabular-nums text-slate-600">
                    {metrics.requiredCadrCfm} CFM
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-600">Effective ACH</p>
                  <p
                    className={`text-2xl font-mono font-semibold tabular-nums mt-1 ${
                      metrics.meetsDesiredAch
                        ? "text-emerald-800"
                        : "text-amber-800"
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
                <p className="text-slate-600">
                  {metrics.formulas.unitConversion}
                </p>
              </div>

              <div className="text-xs text-slate-600 leading-relaxed space-y-1">
                <p>
                  <strong>Calculator Scope:</strong> {metrics.disclaimer}
                </p>
                <p className="text-[11px] text-slate-600">
                  <strong>Scientific Scope &amp; Limitations:</strong> CADR
                  (Clean Air Delivery Rate) estimates particulate clearance flow
                  under ideal well-mixed room assumptions; the 3–6 ACH selector
                  provides illustrative purifier-sizing benchmarks rather than
                  universal medical prescriptions. Actual indoor clean air
                  depends on purifier performance, room air leakage, unit
                  placement, filter condition, and room air mixing. HEPA
                  recirculation does not supply outdoor oxygen or remove carbon
                  monoxide (CO)—rely on certified CO alarms and vented
                  combustion appliances.
                </p>
              </div>
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
