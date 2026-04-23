import indexHtml from "../ui/dist/index.html" with { type: "text" };
import appJs from "../ui/dist/assets/app.js" with { type: "text" };
import appCss from "../ui/dist/assets/app.css" with { type: "text" };

export const ASSETS: Record<string, { body: string; type: string }> = {
  "/": { body: indexHtml, type: "text/html; charset=utf-8" },
  "/index.html": { body: indexHtml, type: "text/html; charset=utf-8" },
  "/assets/app.js": { body: appJs, type: "application/javascript; charset=utf-8" },
  "/assets/app.css": { body: appCss, type: "text/css; charset=utf-8" },
};
