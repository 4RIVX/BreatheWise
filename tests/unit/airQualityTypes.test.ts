import { describe, expect, it } from "vitest";
import { getIndianCategoryStyle } from "../../src/domain/airQualityTypes.ts";
import type { IndianAqiCategory } from "../../src/domain/indianAqi.ts";

const categoryStyles: Array<{
  category: IndianAqiCategory | null;
  className: string;
}> = [
  { category: "Good", className: "text-emerald-800" },
  { category: "Satisfactory", className: "text-teal-800" },
  { category: "Moderate", className: "text-amber-800" },
  { category: "Poor", className: "text-orange-800" },
  { category: "Very Poor", className: "text-rose-800" },
  { category: "Severe", className: "text-red-900" },
  { category: null, className: "text-slate-700" },
];

describe("getIndianCategoryStyle", () => {
  it.each(categoryStyles)(
    "maps $category to its accessible color class",
    ({ category, className }) => {
      expect(getIndianCategoryStyle(category)).toBe(className);
    }
  );
});
