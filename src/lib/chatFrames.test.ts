import { describe, expect, test } from "bun:test";
import { chatFrames, frameMention } from "./chatFrames";

describe("Frame mentions", () => {
  test("recognizes a mention at the caret, including Chinese text, without matching email", () => {
    expect(frameMention("@", 1)).toEqual({ start: 0, end: 1, query: "" });
    expect(frameMention("修改@欢迎 后面的文字", 5)).toEqual({ start: 2, end: 5, query: "欢迎" });
    expect(frameMention("Compare @Frame", 14)).toEqual({ start: 8, end: 14, query: "Frame" });
    expect(frameMention("mail@example.com", 16)).toBeNull();
    expect(frameMention("@Frame done", 11)).toBeNull();
  });

  test("lists canvas order, unsaved localized headlines, empty frames, and panorama slices", () => {
    const frames = chatFrames([
      { id: "a", headline: { "zh-Hans": "原始标题" } },
      { id: "b", headline: {} },
      { id: "c", headline: { "zh-Hans": "全景" } },
    ], ["c", "b"], "", "classic", { c: "panorama" }, {
      a: { headline: { "zh-Hans": "未保存的修改" } },
    }, "zh-Hans");
    expect(frames).toEqual([
      { id: "c#1", sceneId: "c", label: "Frame 1", headline: "全景", subhead: "" },
      { id: "c#2", sceneId: "c", label: "Frame 2", headline: "全景", subhead: "" },
      { id: "b#1", sceneId: "b", label: "Frame 3", headline: "", subhead: "" },
      { id: "a#1", sceneId: "a", label: "Frame 4", headline: "未保存的修改", subhead: "" },
    ]);
  });

  test("uses template layouts and excludes deleted frames", () => {
    const frames = chatFrames([{ id: "a", headline: {} }], ["deleted"], ["panorama"], "classic", {}, {}, "en-US");
    expect(frames.map((frame) => frame.id)).toEqual(["a#1", "a#2"]);
    expect(chatFrames([], [], "", "classic", {}, {}, "en-US")).toEqual([]);
  });
});
