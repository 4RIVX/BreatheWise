import React, { useState } from "react";
import type { StationReading } from "../types/breathewise";

interface IndoorAirPlannerProps {
  station: StationReading;
  roomSqM: number;
  onChangeRoomSqM: (val: number) => void;
  hasHepa: boolean;
  onToggleHepa: (val: boolean) => void;
}

export const IndoorAirPlanner: React.FC<IndoorAirPlannerProps> = ({
  station,
  roomSqM,
  onChangeRoomSqM,
  hasHepa,
  onToggleHepa,
}) => {
  const [ceilingM, setCeilingM] = useState(2.6);
  const [targetAch, setTargetAch] = useState<4 | 5 | 6>(
    station.aqi >= 150 ? 6 : 5
  );

  const volumeM3 = Math.round(roomSqM * ceilingM);
  const requiredCadrM3H = Math.round(volumeM3 * targetAch);
  const requiredCadrCfm = Math.round(requiredCadrM3H * 0.5886);
  const estimatedIndoorPm = hasHepa
    ? Math.max(4, Math.round(station.pm25 * 0.16))
    : Math.max(8, Math.round(station.pm25 * 0.62));

  const protocols = [
    {
      title: "Winter Inversion Window Strategy",
      detail: station.inversionActive
        ? `Keep perimeter windows latched during morning and evening inversion peaks (${station.inversionCeilingM} m ceiling). Cross-ventilate briefly only when afternoon wind rises above 10 km/h.`
        : "Boundary winds are clearing outdoor particulates. A 20-minute cross-breeze flush lowers indoor CO2 safely.",
    },
    {
      title: "HEPA Filtration & Placement",
      detail: `Run true HEPA (H13) at medium-high speed positioned 50 cm from walls to sustain ${targetAch} Air Changes per Hour (${requiredCadrCfm} CFM).`,
    },
    {
      title: "Indoor Moisture & Combustion Control",
      detail: `Outdoor relative humidity is ${station.humidityPct}%. Target 40%–50% indoor RH, avoid unvented candles/incense, and engage vented kitchen exhaust on every cook.`,
    },
  ];

  return (
    <section
      id="indoor"
      className="bg-white border border-slate-200 rounded-xl p-6"
    >
      <div className="pb-5 border-b border-slate-200 flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            Indoor Air Quality & HEPA Sizing
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Calculate room filtration capacity and winter sealing routines calibrated to {station.district}.
          </p>
        </div>

        <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-lg">
          <button
            type="button"
            onClick={() => onToggleHepa(true)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              hasHepa
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            HEPA Running
          </button>
          <button
            type="button"
            onClick={() => onToggleHepa(false)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              !hasHepa
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            No Purifier
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pt-6">
        <div className="lg:col-span-5 space-y-5">
          <div>
            <div className="flex justify-between text-xs font-medium text-slate-700 mb-1.5">
              <label htmlFor="room-area-range">Living Zone Floor Area</label>
              <span className="font-mono tabular-nums text-slate-900">
                {roomSqM} m²
              </span>
            </div>
            <input
              id="room-area-range"
              type="range"
              min={12}
              max={90}
              step={2}
              value={roomSqM}
              onChange={(e) => onChangeRoomSqM(Number(e.target.value))}
              className="w-full accent-teal-700 cursor-pointer"
            />
          </div>

          <div>
            <div className="flex justify-between text-xs font-medium text-slate-700 mb-1.5">
              <label htmlFor="ceiling-height-range">Ceiling Height</label>
              <span className="font-mono tabular-nums text-slate-900">
                {ceilingM.toFixed(1)} m
              </span>
            </div>
            <input
              id="ceiling-height-range"
              type="range"
              min={2.2}
              max={3.6}
              step={0.1}
              value={ceilingM}
              onChange={(e) => setCeilingM(Number(e.target.value))}
              className="w-full accent-teal-700 cursor-pointer"
            />
          </div>

          <div>
            <p className="text-xs font-medium text-slate-700 mb-2">
              Target Air Changes per Hour (ACH)
            </p>
            <div className="grid grid-cols-3 gap-2">
              {([4, 5, 6] as const).map((ach) => (
                <button
                  key={ach}
                  type="button"
                  onClick={() => setTargetAch(ach)}
                  className={`py-2 px-3 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                    targetAch === ach
                      ? "bg-teal-50 border-teal-700 text-teal-900"
                      : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  <span className="font-mono tabular-nums">{ach} ACH</span>
                  <span className="block text-[11px] font-normal text-slate-500 mt-0.5">
                    {ach === 4 ? "Mild" : ach === 5 ? "Smog Day" : "Severe"}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
            <div>
              <p className="text-xs text-slate-500">Required CADR</p>
              <p className="text-2xl font-mono font-semibold tabular-nums text-slate-900 mt-1">
                {requiredCadrCfm}{" "}
                <span className="text-xs font-normal text-slate-500">CFM</span>
              </p>
              <p className="text-xs font-mono tabular-nums text-slate-500 mt-0.5">
                {requiredCadrM3H} m³/h · {volumeM3} m³ room
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Est. Indoor PM2.5</p>
              <p
                className={`text-2xl font-mono font-semibold tabular-nums mt-1 ${
                  estimatedIndoorPm <= 15
                    ? "text-emerald-700"
                    : "text-amber-700"
                }`}
              >
                {estimatedIndoorPm}{" "}
                <span className="text-xs font-normal text-slate-500">µg/m³</span>
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {hasHepa ? "With H13 recirculation" : "Unfiltered infiltration"}
              </p>
            </div>
          </div>
        </div>

        <div className="lg:col-span-7 divide-y divide-slate-100 border-t lg:border-t-0 lg:border-l border-slate-200 lg:pl-8">
          {protocols.map((item, idx) => (
            <div key={item.title} className={idx === 0 ? "pb-4" : "py-4"}>
              <div className="flex items-baseline gap-2.5">
                <span className="font-mono text-xs font-semibold text-teal-700">
                  0{idx + 1}.
                </span>
                <h3 className="text-sm font-semibold text-slate-900">
                  {item.title}
                </h3>
              </div>
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
