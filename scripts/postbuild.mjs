// Finishes dist/cep after `vite build`: classic script tag for file:// loading,
// CEP manifest stamped with the package version, and the remote-debug file.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, chmodSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist/cep");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

const htmlPath = join(dist, "index.html");
let html = readFileSync(htmlPath, "utf8");
// Module scripts are blocked on file://; the bundle is an IIFE, so load it as a classic deferred script.
html = html.replace(/<script type="module" crossorigin src="([^"]+)"><\/script>/, '<script defer src="$1"></script>');
html = html.replace(/ crossorigin/g, "");
writeFileSync(htmlPath, html);

mkdirSync(join(dist, "CSXS"), { recursive: true });
const manifest = readFileSync(join(root, "cep/CSXS/manifest.xml"), "utf8")
  .replace(/ExtensionBundleVersion="[^"]*"/, `ExtensionBundleVersion="${pkg.version}"`)
  .replace(/(<Extension Id="com\.mastereditsuite\.panel" Version=")[^"]*"/, `$1${pkg.version}"`);
writeFileSync(join(dist, "CSXS/manifest.xml"), manifest);
copyFileSync(join(root, "cep/.debug"), join(dist, ".debug"));

// Bundle a local ffmpeg if one was placed in bin/ (git-ignored).
for (const name of ["ffmpeg.exe", "ffmpeg"]) {
  const src = join(root, "bin", name);
  if (existsSync(src)) {
    mkdirSync(join(dist, "bin"), { recursive: true });
    copyFileSync(src, join(dist, "bin", name));
    if (name === "ffmpeg") chmodSync(join(dist, "bin", name), 0o755);
    console.log(`postbuild: bundled bin/${name}`);
  }
}
console.log("postbuild: dist/cep is ready");
