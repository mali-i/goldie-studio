import { describe, expect, test } from "bun:test";
import { compose, LANDSCAPE_LAYOUTS, LANDSCAPE_TYPE, LAYOUT_KEYS } from "./layouts";

const MAC_TILE = { width: 2880, height: 1800 };
const MAC_GEOMETRY = {
  width: 2880,
  height: 1800,
  screen: { x: 0, y: 0, width: 2880, height: 1800 },
  screenRadius: 0,
};
const THEME = { copyHeightRatio: 0.24, deviceWidthRatio: 0.84 };

describe("Mac landscape layouts", () => {
  test("provides a dedicated composition for all eleven layouts", () => {
    expect(Object.keys(LANDSCAPE_LAYOUTS)).toEqual([...LAYOUT_KEYS]);

    for (const key of LAYOUT_KEYS) {
      const layout = LANDSCAPE_LAYOUTS[key];
      const composition = compose(layout, MAC_TILE, THEME, { geom: MAC_GEOMETRY });

      expect(composition.width).toBe(MAC_TILE.width * layout.span);
      expect(composition.height).toBe(MAC_TILE.height);
      expect(composition.type).toBe(LANDSCAPE_TYPE);
      expect(composition.devices).toHaveLength(layout.devices.length);
      for (const device of composition.devices) {
        expect(Number.isFinite(device.frame.left)).toBe(true);
        expect(Number.isFinite(device.frame.top)).toBe(true);
        expect(device.frame.width).toBeGreaterThan(0);
        expect(device.frame.height).toBeGreaterThan(0);
        expect(device.screen.width / device.screen.height).toBeCloseTo(16 / 10, 5);
      }
    }
  });

  test("uses desktop-sized type and preserves the phone theme controls", () => {
    const mac = compose(LANDSCAPE_LAYOUTS.classic, MAC_TILE, THEME, { geom: MAC_GEOMETRY });
    expect(mac.type.headlineSize).toBe(0.048);
    expect(mac.type.subheadSize).toBe(0.022);
    expect(mac.devices[0]?.frame.width).toBeLessThan(MAC_TILE.width * 0.77);
  });
});
