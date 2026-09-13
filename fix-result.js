/*
 * 打席結果(result)の csv を直す。
 *
 *   node fix-result.js [--dry] [ファイル...]
 *      (既定は site と csv の中の result 形式の csv すべて)
 *
 * <p>やることは 2 つ。
 * <ol>
 *   <li>表と裏の並びが逆の試合を、表 → 裏の順に並べ直す。
 *       (表裏の書き分け自体は合っていて、順番だけが逆になっている)</li>
 *   <li>打席の左右(batterStance)と投手の投げ手(pitcherThrows)の列を足す。
 *       誰がどちらかは下の表で決める。</li>
 * </ol>
 */
const fs = require("fs");
const path = require("path");

/** 左投げの人。ここに無い人は右投げ。 */
const LEFT_THROW = new Set(["gaifukaisei"]);
/** 左打ちの人。ここに無い人は右打ち。 */
const LEFT_BAT = new Set(["gaifukaisei", "Alpha6000", "Pen4"]);

const throwOf = name => LEFT_THROW.has(name) ? "L" : "R";
const batOf = name => LEFT_BAT.has(name) ? "L" : "R";

/** result 形式の csv か。 */
const isResult = head => head.includes("game_id") && head.includes("inning")
  && head.includes("half");

function fixFile(at, dry) {
  const text = fs.readFileSync(at, "utf8");
  const lines = text.replace(/\r/g, "").split("\n").filter(l => l.trim());
  if (!lines.length) return null;
  const head = lines[0].split(",").map(h => h.trim());
  const lower = head.map(h => h.toLowerCase());
  if (!isResult(lower)) return null;
  const idx = {};
  lower.forEach((k, i) => idx[k] = i);

  const rows = lines.slice(1).map(l => l.split(","));
  let swapped = 0, handed = 0;

  // ---- 1. 表と裏の並びが逆の試合を直す
  const games = [...new Set(rows.map(c => c[idx.game_id]))];
  const fixed = [];
  games.forEach(id => {
    const mine = rows.filter(c => c[idx.game_id] === id);
    const firstHalf = mine.length ? String(mine[0][idx.half]).toUpperCase() : "";
    if (firstHalf === "BOTTOM") {
      // 回ごとに 表 → 裏 の順へ。回の中の並びはそのまま。
      const order = [...new Set(mine.map(c => Number(c[idx.inning])))]
        .sort((a, b) => a - b);
      order.forEach(inning => {
        ["TOP", "BOTTOM"].forEach(half => {
          mine.filter(c => Number(c[idx.inning]) === inning
            && String(c[idx.half]).toUpperCase() === half)
            .forEach(c => fixed.push(c));
        });
      });
      swapped++;
    } else {
      mine.forEach(c => fixed.push(c));
    }
  });

  // ---- 2. 左右の列を足す
  let width = head.length;
  if (idx.batterstance === undefined) {
    head.push("batterStance");
    lower.push("batterstance");
    idx.batterstance = head.length - 1;
    width++;
  }
  if (idx.pitcherthrows === undefined) {
    head.push("pitcherThrows");
    lower.push("pitcherthrows");
    idx.pitcherthrows = head.length - 1;
    width++;
  }
  fixed.forEach(c => {
    while (c.length < width) c.push("");
    const batter = c[idx.batter !== undefined ? idx.batter : idx.battername];
    const pitcher = c[idx.pitcher !== undefined ? idx.pitcher : idx.pitchername];
    const want = batOf(batter), hand = throwOf(pitcher);
    if (c[idx.batterstance] !== want || c[idx.pitcherthrows] !== hand) handed++;
    c[idx.batterstance] = want;
    c[idx.pitcherthrows] = hand;
  });

  if (!swapped && !handed) return null;
  const out = [head.join(",")].concat(fixed.map(c => c.join(","))).join("\n") + "\n";
  if (!dry) fs.writeFileSync(at, out);
  return { swapped, handed, rows: fixed.length };
}

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const named = args.filter(a => a !== "--dry");
const targets = named.length ? named : (() => {
  const list = [];
  ["site", "csv", "."].forEach(dir => {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).filter(f => /\.csv$/i.test(f))
      .forEach(f => list.push(path.join(dir, f)));
  });
  return list;
})();

let files = 0;
targets.forEach(at => {
  if (!fs.existsSync(at)) return;
  const done = fixFile(at, dry);
  if (!done) return;
  files++;
  console.log("  " + at + "  並べ直した試合 " + done.swapped
    + " / 左右を入れた行 " + done.handed + " (全 " + done.rows + " 行)");
});
console.log((dry ? "(直さずに数えました) " : "") + files + " ファイルを直しました");
