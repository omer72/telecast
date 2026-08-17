/**
 * Publish a built release APK to the GitHub Pages site in docs/.
 *
 * Copies the APK, writes version.json next to it, and updates the version
 * label on the landing page — all from android/app/build.gradle, which is the
 * only place a version is authored.
 *
 * Doing these together is the point. version.json is what the app checks to
 * decide whether to nag about an upgrade, so a manifest that disagrees with
 * the APK beside it would tell people to install a build that isn't there.
 *
 * Run: npm run publish
 */
import { readFileSync, writeFileSync, copyFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const gradlePath = resolve(root, "android/app/build.gradle");
const apkPath = resolve(root, "android/app/build/outputs/apk/release/app-release.apk");
const docsApk = resolve(root, "docs/telecast.apk");
const manifestPath = resolve(root, "docs/version.json");
const indexPath = resolve(root, "docs/index.html");

const gradle = readFileSync(gradlePath, "utf8");
const versionName = gradle.match(/versionName\s+"([^"]+)"/)?.[1];
const versionCode = Number(gradle.match(/versionCode\s+(\d+)/)?.[1]);
if (!versionName || !Number.isFinite(versionCode)) {
  console.error("Could not read versionName/versionCode from android/app/build.gradle");
  process.exit(1);
}

let apkStat;
try {
  apkStat = statSync(apkPath);
} catch {
  console.error(`No release APK at ${apkPath}\nBuild one first: cd android && ./gradlew assembleRelease`);
  process.exit(1);
}

// The notes shown in-app come from the argument, falling back to something
// truthful rather than inventing a changelog.
const notes = process.argv.slice(2).join(" ") || `Telecast ${versionName}`;

// Downloader code lives in the landing page; read it rather than duplicating
// it here, so there's still exactly one place it's written down.
const indexHtml = readFileSync(indexPath, "utf8");
const downloaderCode = indexHtml.match(/<div class="code">(\d+)<\/div>/)?.[1] || "";

copyFileSync(apkPath, docsApk);

writeFileSync(
  manifestPath,
  JSON.stringify({ versionCode, versionName, apk: "telecast.apk", downloaderCode, notes }, null, 2) + "\n"
);

// Landing page label: "v1.6 · Android TV 7.0 or newer …"
const updated = indexHtml.replace(
  /(<p class="hero-note">)v[\d.]+/,
  `$1v${versionName}`
);
if (updated === indexHtml && !indexHtml.includes(`>v${versionName} `)) {
  console.warn("! Could not update the version label in docs/index.html — check it by hand");
} else {
  writeFileSync(indexPath, updated);
}

const mib = (apkStat.size / 1024 / 1024).toFixed(1);
console.log(`Published ${versionName} (${versionCode})`);
console.log(`  docs/telecast.apk   ${apkStat.size} bytes (${mib} MiB)`);
console.log(`  docs/version.json   downloaderCode=${downloaderCode || "(none found)"}`);
console.log(`  docs/index.html     label -> v${versionName}`);
