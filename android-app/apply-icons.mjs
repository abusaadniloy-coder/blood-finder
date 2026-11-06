// Replace Capacitor's default launcher icon with the BLOOD FINDER icon (run after "cap add android")
import { cpSync, existsSync, rmSync } from "node:fs";
const here = new URL("./", import.meta.url).pathname;
const res = here + "android/app/src/main/res/";
if (!existsSync(res)) throw new Error("run npx cap add android first");
for (const d of ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"]) {
  for (const f of ["ic_launcher.png", "ic_launcher_round.png", "ic_launcher_foreground.png"]) {
    cpSync(`${here}res/mipmap-${d}/${f}`, `${res}mipmap-${d}/${f}`);
  }
}
// use the plain PNG icons instead of the default adaptive icon
rmSync(res + "mipmap-anydpi-v26", { recursive: true, force: true });
console.log("icons applied");
