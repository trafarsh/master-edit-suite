// Unsigned extensions only load with PlayerDebugMode on. Sets it for the CSXS
// versions used by After Effects 2024 and later (CEP 11 and 12).
import { execFileSync } from "node:child_process";
import { platform } from "node:os";

const versions = ["11", "12"];
for (const v of versions) {
  if (platform() === "win32") {
    execFileSync("reg", ["add", `HKCU\\Software\\Adobe\\CSXS.${v}`, "/v", "PlayerDebugMode", "/t", "REG_SZ", "/d", "1", "/f"], { stdio: "inherit" });
  } else if (platform() === "darwin") {
    execFileSync("defaults", ["write", `com.adobe.CSXS.${v}`, "PlayerDebugMode", "1"], { stdio: "inherit" });
  } else {
    console.error("After Effects runs on Windows and macOS only.");
    process.exit(1);
  }
  console.log(`PlayerDebugMode enabled for CSXS.${v}`);
}
console.log("Restart After Effects for this to take effect.");
