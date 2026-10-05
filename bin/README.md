# bin/

Put an ffmpeg binary here (`ffmpeg.exe` on Windows, `ffmpeg` on macOS) to bundle it
with the extension; `npm run build` copies it into `dist/cep/bin/`. Render and
convert looks for ffmpeg in this order:

1. The ffmpeg path set in Settings
2. `bin/ffmpeg(.exe)` inside the installed extension
3. `ffmpeg` on the system PATH

Binaries are git-ignored. The MP4 step needs an ffmpeg build with libx264, which is
GPL. That is fine for the internal v1; revisit it if the plugin is ever sold (see
the PRD's open questions).
