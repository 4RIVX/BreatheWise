import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_CLEAN_AIR_ROUTINES } from "../../src/domain/defaultRoutines";

describe("Dependency Parity & Default Routine Integrity", () => {
  it("verifies sharp dependency >=0.35.5 is declared in package.json", () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf-8")
    );
    expect(pkg.dependencies.sharp).toBeDefined();
    expect(pkg.dependencies.sharp).toMatch(/^\^?0\.3[5-9]/);
  });

  it("ensures default clean-air routines do not contain arbitrary uncalculated CO2 savings", () => {
    for (const routine of DEFAULT_CLEAN_AIR_ROUTINES) {
      expect(routine.co2SavedKg).toBe(0.0);
    }
  });

  it("keeps runtime and build dependencies in the correct sections and preserves .gitignore", () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf-8")
    );
    expect(fs.existsSync(path.resolve(process.cwd(), ".gitignore"))).toBe(true);
    expect(pkg.dependencies.sharp).toBe("^0.35.5");
    expect(pkg.devDependencies.typescript).toBe("^5.9.3");
    expect(pkg.dependencies.typescript).toBeUndefined();

    const npmLockPath = path.resolve(process.cwd(), "package-lock.json");
    if (fs.existsSync(npmLockPath)) {
      const npmLock = fs.readFileSync(npmLockPath, "utf-8");
      expect(npmLock).toContain('"sharp": "^0.35.5"');
      expect(npmLock).toContain('"typescript": "^5.9.3"');
    }
  });
});
