import { expect, test } from "bun:test";
import { createDirectoryPicker } from "./directory-picker";

test("returns paths containing spaces and Unicode, and handles cancellation", async () => {
  expect(await createDirectoryPicker(async () => "/Users/test/My 应用/\n", "darwin")()).toBe("/Users/test/My 应用/");
  expect(await createDirectoryPicker(async () => "\n", "darwin")()).toBeNull();
});

test("prevents overlapping dialogs and releases the lock after failure", async () => {
  let reject!: (reason: Error) => void;
  let calls = 0;
  const picker = createDirectoryPicker(() => {
    calls++;
    return calls === 1 ? new Promise<string>((_resolve, fail) => { reject = fail; }) : Promise.resolve("/tmp");
  }, "darwin");
  const first = picker();
  await expect(picker()).rejects.toThrow("already open");
  reject(new Error("process failed"));
  await expect(first).rejects.toThrow("Could not select");
  expect(await picker()).toBe("/tmp");
});

test("does not launch a picker on unsupported platforms", async () => {
  let called = false;
  const picker = createDirectoryPicker(async () => { called = true; return "/tmp"; }, "linux");
  await expect(picker()).rejects.toThrow("macOS");
  expect(called).toBe(false);
});
