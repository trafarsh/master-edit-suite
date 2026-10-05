// Builds the Windows installer (dist/MasterEditSuite-Setup-<version>.exe) from
// dist/cep with NSIS. Run `npm run build` first; needs makensis on the PATH
// (Windows: install NSIS 3; Linux/macOS: the "nsis" package).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const src = join(root, "dist", "cep");
const out = join(root, "dist", `MasterEditSuite-Setup-${pkg.version}.exe`);

if (!existsSync(join(src, "CSXS", "manifest.xml"))) {
  console.error("dist/cep is missing; run `npm run build` first.");
  process.exit(1);
}
const flag = process.platform === "win32" ? "/" : "-";
execFileSync(
  "makensis",
  [`${flag}V2`, `${flag}DVERSION=${pkg.version}`, `${flag}DSRC=${src}`, `${flag}DOUTFILE=${out}`, join(root, "installer", "installer.nsi")],
  { stdio: "inherit" },
);
console.log(`installer: ${out}`);
