// Copy the website (repository root) into www/ so Capacitor can bundle it inside the APK
import { cpSync, mkdirSync, rmSync } from "node:fs";
const root = new URL("../", import.meta.url).pathname;
const www = new URL("./www/", import.meta.url).pathname;
rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });
for (const f of ["index.html", "manifest.webmanifest", "css", "js", "icons"]) {
  cpSync(root + f, www + f, { recursive: true });
}
console.log("www ready");
