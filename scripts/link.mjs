// Links dist/cep into the per-user CEP extensions folder so After Effects loads
// the local build. `npm run unlink` removes the link. Run `npm run build` first.
import { existsSync, lstatSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ID = "com.mastereditsuite.panel";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, "dist", "cep");

function extensionsDir() {
  if (platform() === "win32") return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "Adobe", "CEP", "extensions");
  if (platform() === "darwin") return join(homedir(), "Library", "Application Support", "Adobe", "CEP", "extensions");
  throw new Error("After Effects runs on Windows and macOS only.");
}

const link = join(extensionsDir(), ID);
const exists = (() => {
  try {
    lstatSync(link);
    return true;
  } catch {
    return false;
  }
})();

if (process.argv.includes("--remove")) {
  if (exists) rmSync(link, { recursive: false, force: true });
  console.log(`Removed ${link}`);
} else {
  if (!existsSync(join(target, "CSXS", "manifest.xml"))) {
    console.error("dist/cep is missing; run `npm run build` first.");
    process.exit(1);
  }
  if (exists) rmSync(link, { force: true });
  mkdirSync(dirname(link), { recursive: true });
  // A junction needs no admin rights on Windows.
  symlinkSync(target, link, platform() === "win32" ? "junction" : "dir");
  console.log(`Linked ${link} -> ${target}`);
  console.log("Restart After Effects, then open Window > Extensions > Master Edit Suite.");
}
