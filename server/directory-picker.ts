import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(execFile);
// Constant script: paths and other request data are never interpolated into AppleScript.
const SCRIPT = `try
  set selectedFolder to choose folder with prompt "Choose your app source folder"
  return POSIX path of selectedFolder
on error number -128
  return ""
end try`;

async function runPicker(): Promise<string> {
  const { stdout } = await execute("/usr/bin/osascript", ["-e", SCRIPT], { timeout: 120_000, maxBuffer: 64 * 1024 });
  return stdout;
}

export function createDirectoryPicker(run = runPicker, platform = process.platform) {
  let picking = false;
  return async (): Promise<string | null> => {
    if (platform !== "darwin") throw new Error("The native folder picker is available on macOS.");
    if (picking) throw new Error("A folder picker is already open. Finish or cancel it first.");
    picking = true;
    try { return (await run()).trim() || null; }
    catch { throw new Error("Could not select a folder. Please try again."); }
    finally { picking = false; }
  };
}

export const pickAppDirectory = createDirectoryPicker();
