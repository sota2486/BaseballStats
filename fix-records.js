/*
 * 古い記録 csv の見出しを今の形に直す。
 *
 * <p>1 球ごとの記録に stance(左右打席)の列を足したとき、見出しは
 * 新しいファイルにしか書かれなかった。そのため古いファイルは
 * 「古い見出し + 新しい並びの行」になり、読む側が列をずらして解釈する。
 * サイトで球種が "R"(本当は stance の値)と出るのはこれが原因。
 *
 *   node fix-records.js [フォルダ...]    (既定は site)
 *
 * <p>見出しを今のものに置き換え、列が 1 つ足りない行には
 * batter の次(stance)に空欄を挿す。直す必要が無いファイルは触らない。
 */
const fs = require("fs");
const path = require("path");

/** 今の 1 球ごとの記録の見出し。PitchData.csvHeader() と同じ並び。 */
const HEADER = [
  "side", "game", "pa", "pitch_no", "inning", "half", "count", "outs",
  "pitcher", "batter", "stance",
  "type", "velocity", "v_break", "h_break", "zone", "in_zone",
  "plate_x", "plate_y",
  "swing", "whiff", "contact", "call",
  "exit_velocity", "launch_angle", "spray_angle", "distance",
  "result"
].join(",");

const COLUMNS = HEADER.split(",").length;
const STANCE_AT = HEADER.split(",").indexOf("stance");

/** その csv は 1 球ごとの記録か。見出しで見分ける。 */
function isPitchFile(head) {
  const lower = head.toLowerCase();
  return lower.includes("side") && lower.includes("pitch_no");
}

function repair(file) {
  const text = fs.readFileSync(file, "utf8");
  const lines = text.replace(/\r/g, "").split("\n");
  if (!lines.length || !isPitchFile(lines[0])) return null;
  if (lines[0] === HEADER) return null;

  let padded = 0;
  const out = [HEADER];
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i];
    if (!row.trim()) continue;
    const cells = row.split(",");
    if (cells.length === COLUMNS - 1) {
      cells.splice(STANCE_AT, 0, "");
      padded++;
    }
    out.push(cells.join(","));
  }
  fs.writeFileSync(file, out.join("\n") + "\n");
  return { rows: out.length - 1, padded };
}

const dirs = process.argv.slice(2);
const targets = dirs.length ? dirs : ["site"];
let touched = 0;
targets.forEach(dir => {
  if (!fs.existsSync(dir)) {
    console.log(dir + " が見つかりません");
    return;
  }
  fs.readdirSync(dir)
    .filter(f => /\.csv$/i.test(f))
    .forEach(f => {
      const at = path.join(dir, f);
      const done = repair(at);
      if (done) {
        touched++;
        console.log(at + " を直しました (" + done.rows + " 行 / 空欄を挿した行 "
          + done.padded + ")");
      }
    });
});
console.log(touched ? touched + " 件直しました" : "直す必要のあるファイルはありませんでした");
