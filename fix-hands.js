/*
 * 投げる手の列を、今ある記録にも足す。
 *
 * <p>1 球ごとの記録(record/<名前>.csv)には投手の投げる手(throws)、
 * 守備と走塁の記録(record/<名前>_play.csv)にはその人の投げる手(throwHand)を、
 * それぞれ列の末尾に足す。どちらも見出しに無ければ足し、行には値を入れる。
 *
 *   node fix-hands.js [--dry] [フォルダ...]    (既定は csv site)
 *
 * <p>投げる手はここに書いた表で決める。表に無い人は右投げ。
 * 打席の左右(stance)も、左打ちの人はここでまとめて直す。
 */
const fs = require("fs");
const path = require("path");

/** 左投げの人。ここに無い人は右投げ。 */
const LEFT_THROW = new Set(["gaifukaisei"]);
/** 左打ちの人。record の stance をこの値に揃える。 */
const LEFT_BAT = new Set(["gaifukaisei"]);

const handOf = name => LEFT_THROW.has(name) ? "L" : "R";

/** 1 球ごとの記録か。見出しで見分ける。 */
const isPitchFile = head => head.includes("pitch_no") && head.includes("pitcher");
/** 守備と走塁の記録か。 */
const isPlayFile = head => head.includes("kind") && head.includes("touchorder");

function fixPitch(lines, head) {
  const idx = {};
  head.forEach((k, i) => idx[k] = i);
  let added = 0, stanced = 0;
  const width = head.length + (idx.throws === undefined ? 1 : 0);
  if (idx.throws === undefined) {
    head.push("throws");
    idx.throws = head.length - 1;
  }
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const c = lines[i].split(",");
    while (c.length < width) c.push("");
    if (!c[idx.throws]) {
      c[idx.throws] = handOf(c[idx.pitcher]);
      added++;
    }
    // 左打ちの人の打席は左に揃える
    if (idx.stance !== undefined && LEFT_BAT.has(c[idx.batter]) && c[idx.stance] !== "L") {
      c[idx.stance] = "L";
      stanced++;
    }
    lines[i] = c.join(",");
  }
  return { added, stanced };
}

function fixPlay(lines, head, owner) {
  const idx = {};
  head.forEach((k, i) => idx[k] = i);
  let added = 0;
  const width = head.length + (idx.throwhand === undefined ? 1 : 0);
  if (idx.throwhand === undefined) {
    head.push("throwHand");
    idx.throwhand = head.length - 1;
  }
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const c = lines[i].split(",");
    while (c.length < width) c.push("");
    if (!c[idx.throwhand]) {
      // player 列が空なら、ファイル名の人のもの
      c[idx.throwhand] = handOf(c[idx.player] || owner);
      added++;
    }
    lines[i] = c.join(",");
  }
  return { added };
}

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const dirs = args.filter(a => a !== "--dry");
const targets = dirs.length ? dirs : ["csv", "site"];

let files = 0, pitches = 0, plays = 0, stances = 0;
targets.forEach(dir => {
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir).filter(f => /\.csv$/i.test(f)).forEach(f => {
    const at = path.join(dir, f);
    const lines = fs.readFileSync(at, "utf8").replace(/\r/g, "").split("\n");
    if (!lines.length) return;
    const head = lines[0].split(",").map(h => h.trim());
    const lower = head.map(h => h.toLowerCase());
    let done = null;
    if (isPitchFile(lower)) {
      done = fixPitch(lines, lower);
      pitches += done.added;
      stances += done.stanced;
    } else if (isPlayFile(lower)) {
      const owner = f.replace(/_play\.csv$/i, "");
      done = fixPlay(lines, lower, owner);
      plays += done.added;
    }
    if (!done || (!done.added && !done.stanced)) return;
    files++;
    // 見出しは元の書き方(大文字小文字)を保つ。足したぶんだけ後ろに付ける。
    const extra = lower.length - head.length;
    for (let i = 0; i < extra; i++) head.push(lower[head.length]);
    lines[0] = head.join(",");
    console.log("  " + at + "  投げ手 " + done.added + " 行"
      + (done.stanced ? " / 打席の左右 " + done.stanced + " 行" : ""));
    if (!dry) fs.writeFileSync(at, lines.join("\n"));
  });
});
console.log((dry ? "(直さずに数えました) " : "")
  + files + " ファイル  1 球ごと " + pitches + " 行 / 守備走塁 " + plays + " 行"
  + (stances ? " / 打席の左右 " + stances + " 行" : ""));
