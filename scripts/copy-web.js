// Copies the app screens (frontend/) into the Windows app (desktop/web) or the Android app (mobile/www).
// Usage: node scripts/copy-web.js desktop   |   node scripts/copy-web.js mobile
const fs = require("fs");
const path = require("path");

const target = process.argv[2];
const DEST = { desktop: "desktop/web", mobile: "mobile/www" }[target];
if (!DEST) { console.error("Say which app: desktop or mobile"); process.exit(1); }

const root = path.join(__dirname, "..");
const from = path.join(root, "frontend");
const to = path.join(root, DEST);

fs.rmSync(to, { recursive: true, force: true });
fs.cpSync(from, to, { recursive: true, filter: src => !/[\\/]sw\.js$/.test(src) });   // the apps don't need the website's offline helper
console.log(`Copied app screens to ${DEST}`);
