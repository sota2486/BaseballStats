/*
 * 打席結果とカウントが噛み合っていない行を直す。
 *
 *   node fix-count.js [--dry] [フォルダ...]     (既定は csv site)
 *
 * <p>決め球そのものを計測できずに終わった打席では、打席結果が
 * 「最後に測れた 1 球」に付く。そのため「1 ストライクで三振」
 * 「2 ボールで四球」という行ができて、カウント別の成績が読めなくなる。
 *
 * <p>三振の行は 2 ストライク、四球の行は 3 ボールに直す。
 * 打った球はカウントと関係なく決まるので触らない。
 */
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const dirs = args.filter(a => a !== "--dry");
const targets = dirs.length ? dirs : ["csv", "site"];

let files = 0, fixedK = 0, fixedBB = 0;
targets.forEach(dir => {
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir).filter(f => /\.csv$/i.test(f)).forEach(f => {
    const at = path.join(dir, f);
    const lines = fs.readFileSync(at, "utf8").replace(/\r/g, "").split("\n");
    if (!lines.length) return;
    const head = lines[0].split(",").map(h => h.trim().toLowerCase());
    const iCount = head.indexOf("count");
    const iResult = head.indexOf("result");
    if (iCount < 0 || iResult < 0 || head.indexOf("pitch_no") < 0) return;
    let touched = 0;
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const c = lines[i].split(",");
      const result = (c[iResult] || "").trim();
      const m = String(c[iCount] || "").match(/^(\d)-(\d)$/);
      if (!m) continue;
      let balls = Number(m[1]), strikes = Number(m[2]);
      if (result === "STRIKE_OUT" && strikes < 2) { strikes = 2; fixedK++; }
      else if (result === "WALK" && balls < 3) { balls = 3; fixedBB++; }
      else continue;
      c[iCount] = balls + "-" + strikes;
      lines[i] = c.join(",");
      touched++;
    }
    if (!touched) return;
    files++;
    console.log("  " + at + "  " + touched + " 行");
    if (!dry) fs.writeFileSync(at, lines.join("\n"));
  });
});
console.log((dry ? "(直さずに数えました) " : "")
  + files + " ファイル / 三振 " + fixedK + " 行・四球 " + fixedBB + " 行を直しました");
