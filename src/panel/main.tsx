import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { initTheme } from "./app/theme";
import { logger } from "./node/logger";
import "./styles.css";

declare const __APP_VERSION__: string;

window.addEventListener("error", (e) => logger.error("Uncaught error", { message: e.message, source: e.filename, line: e.lineno }));
window.addEventListener("unhandledrejection", (e) => logger.error("Unhandled rejection", { reason: String(e.reason) }));

initTheme();
logger.info(`Panel ${__APP_VERSION__} starting`);
createRoot(document.getElementById("root")!).render(<App />);
