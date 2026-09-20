import { describe, expect, test } from "bun:test";
import { compose, LANDSCAPE_LAYOUTS, LANDSCAPE_TYPE, LAYOUT_KEYS, LAYOUTS } from "./layouts";

const MAC_TILE = { width: 2880, height: 1800 };
const MAC_GEOMETRY = {
  width: 3626,
  height: 2720,
  screen: { x: 453, y: 433, width: 2720, height: 1766 },
  screenRadius: 24,
};
const THEME = { copyHeightRatio: 0.24, deviceWidthRatio: 0.84 };

describe("Mac landscape layouts", () => {
  test("provides a dedicated composition for every layout", () => {
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
        expect(device.screen.width / device.screen.height).toBeCloseTo(
          layout.capturePresentation?.aspectRatio ?? 2720 / 1766,
          5,
        );
      }
    }
  });

  test("uses desktop-sized type and preserves the phone theme controls", () => {
    const mac = compose(LANDSCAPE_LAYOUTS.classic, MAC_TILE, THEME, { geom: MAC_GEOMETRY });
    expect(mac.type.headlineSize).toBe(0.048);
    expect(mac.type.subheadSize).toBe(0.022);
    expect(mac.devices[0]?.frame.top).toBeGreaterThanOrEqual(mac.copy?.box.height ?? 0);
    expect(
      (mac.devices[0]?.frame.top ?? 0) + (mac.devices[0]?.frame.height ?? 0),
    ).toBeLessThanOrEqual(MAC_TILE.height);
  });

  test("overlapping screenshots keep both captures below copy with the second in front", () => {
    const c = compose(LAYOUTS["overlap-tilt"], MAC_TILE, THEME, { geom: MAC_GEOMETRY });
    const [left, right] = c.devices;
    expect(c.devices.map((device) => device.capture)).toEqual(["secondary", "primary"]);
    expect(left!.frame.top).toBeGreaterThan(c.copy!.box.height);
    expect(right!.frame.top).toBeGreaterThan(c.copy!.box.height);
    expect(left!.frame.left + left!.frame.width).toBeGreaterThan(right!.frame.left);
    expect(right!.frame.width).toBeGreaterThan(left!.frame.width);
    expect(left!.frame.top + left!.frame.height).toBeGreaterThan(MAC_TILE.height);
  });

  test("side by side uses 3:4 screenshot cards independent of the Mac frame", () => {
    const layout = LANDSCAPE_LAYOUTS["side-by-side"];
    const c = compose(layout, MAC_TILE, THEME, { geom: MAC_GEOMETRY });
    expect(layout.capturePresentation?.aspectRatio).toBe(3 / 4);
    for (const device of c.devices) {
      expect(device.frame.width).toBe(MAC_TILE.width * 0.45);
      expect(device.frame.width / device.frame.height).toBeCloseTo(3 / 4);
      expect(device.screen).toMatchObject(device.frame);
    }
  });

  test("slot geometry overrides only the selected card and keeps its aspect ratio", () => {
    const spec = LAYOUTS["side-by-side"];
    const original = compose(spec, MAC_TILE, THEME, { geom: MAC_GEOMETRY });
    const edited = compose(spec, MAC_TILE, THEME, {
      geom: MAC_GEOMETRY,
      slotGeometries: {
        primary: { x: 0.36, y: 0.63, widthRatio: 0.36, rotate: 12 },
      },
    });
    expect(edited.devices[0]?.frame.width).toBe(MAC_TILE.width * 0.36);
    expect(edited.devices[0]?.frame.width / edited.devices[0]!.frame.height).toBeCloseTo(3 / 4);
    expect(edited.devices[0]?.frame.left).not.toBe(original.devices[0]?.frame.left);
    expect(edited.devices[0]?.rotate).toBe(12);
    expect(edited.devices[1]).toEqual(original.devices[1]);
  });

  test("screenshot pair shows two complete, separated captures beneath the copy", () => {
    const c = compose(LAYOUTS["screenshot-pair"], MAC_TILE, THEME, { geom: MAC_GEOMETRY });
    const [left, right] = c.devices;
    expect(c.devices.map((device) => device.capture)).toEqual(["primary", "secondary"]);
    expect(LAYOUTS["screenshot-pair"].capturePresentation?.objectFit).toBe("contain");
    expect(left!.rotate).toBe(0);
    expect(right!.rotate).toBe(0);
    expect(left!.frame.top).toBeGreaterThan(c.copy!.box.height);
    expect(left!.frame.left + left!.frame.width).toBeLessThan(right!.frame.left);
    expect(left!.frame.top + left!.frame.height).toBeLessThanOrEqual(MAC_TILE.height);
    expect(right!.frame.top + right!.frame.height).toBeLessThanOrEqual(MAC_TILE.height);
  });
});
