import { describe, expect, it } from "vitest";
import { describeError, formatBytes, formatDuration, matchesQuery, usbSizeWarning } from "./format.ts";

describe("format", () => {
  it("formatBytes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1,5 KB");
    expect(formatBytes(4 * 1024 ** 3)).toBe("4,0 GB");
    expect(formatBytes(150 * 1024 ** 2)).toBe("150 MB");
  });
  it("formatDuration", () => {
    expect(formatDuration(5)).toBe("5 s");
    expect(formatDuration(125)).toBe("2 min");
    expect(formatDuration(3700)).toBe("1 h 1 min");
    expect(formatDuration(Infinity)).toBe("—");
  });
  it("avisa de FAT32 solo a partir de 4 GB", () => {
    expect(usbSizeWarning(4 * 1024 ** 3 - 1)).toBeNull();
    expect(usbSizeWarning(4 * 1024 ** 3)).toMatch(/exFAT/);
  });
  it("describeError", () => {
    expect(describeError(new DOMException("x", "QuotaExceededError"), 1)).toMatch(/espacio/);
    expect(describeError(new DOMException("x", "NotAllowedError"), 1)).toMatch(/permiso/);
    expect(describeError(new Error("write failed"), 5 * 1024 ** 3)).toMatch(/exFAT/);
    expect(describeError(new Error("write failed"), 100)).toBe("write failed");
  });
  it("matchesQuery ignora tildes, mayúsculas y orden", () => {
    expect(matchesQuery("Seguridad informática Kali", "informatica kali")).toBe(true);
    expect(matchesQuery("Kali", "ubuntu")).toBe(false);
    expect(matchesQuery("Kali", "")).toBe(true);
  });
});
