// 修正 TikTok gen/android 的 BuildTask.kt executable：
// sed 转义在 Kotlin 三引号字符串里反复踩坑，改用 node + JSON.stringify 保证反斜杠原样。
// 用法：node scripts/patch-buildtask.mjs [nodeExe 绝对路径，缺省 = node 裸名]
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const f = fileURLToPath(new URL("../src-tauri-tiktok/gen/android/buildSrc/src/main/java/com/whf/tiktok/kotlin/BuildTask.kt", import.meta.url));
let s = readFileSync(f, "utf8");
const nodeExe = process.argv[2] || "node";
const lit = nodeExe === "node" ? '"node"' : JSON.stringify(nodeExe);
s = s.replace(/val executable = [^\r\n]*/, `val executable = ${lit};`);
writeFileSync(f, s);
console.log("patched:", /val executable = .*/.exec(s)?.[0]);
