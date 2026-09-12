/*
 * 本塁打の飛距離を計算し直す。
 *
 * <p>柵を越えた瞬間の位置で測っていたころの記録は、どの本塁打も
 * フェンスまでの距離にしかなっていない。打球の初速と角度は残っているので、
 * そこから「何にも当たらずに飛んだらどこまで行ったか」を出して入れ直す。
 *
 *   node fix-distance.js [--dry] [フォルダ...]    (既定は csv site)
 *
 * <p>雪玉の飛び方は毎 tick「進む → 速度 × 0.99 → 上下の速度 − 0.03」。
 * 回転の力(マグヌス)は記録に残っていないので 0 として計算する。
 * そのぶん実際よりやや短めに出る。
 *
 * <p>直すのは result が HOME_RUN の行だけ。
 */
const fs = require("fs");
const path = require("path");

/** 重力。1 tick あたりの下向きの加速。 */
const GRAVITY = 0.03;
/** 空気抵抗。1 tick ごとに速度へ掛ける。 */
const DRAG = 0.99;
/** 打球が離れる高さ(ブロック)。 */
const CONTACT_HEIGHT = 1.0;
/**
 * 回転のぶんの伸び。
 *
 * <p>実際の打球にはバックスピンが掛かっていて、その浮力(マグヌス力)で
 * 計算より遠くまで飛ぶ。回転は記録に残っていないので、実測から割り出した
 * 一定の係数で伸ばす。
 *
 * <p>合わせ込みに使った実測:
 * 28.7° 182km/h → 127m / 26.2° 187km/h → 128m / 27.9° 198km/h → 143m。
 * 回転なしの計算はそれぞれ 117.4m / 118.9m / 132.1m で、比は 1.082 / 1.077 / 1.083。
 */
const SPIN_GAIN = 1.08;

/**
 * 初速(km/h)と打ち出し角(度)から、地面に落ちるまでの水平距離(m)。
 */
function carry(kmh, degrees) {
  // km/h → 1 tick あたりのブロック数
  const speed = kmh / 3.6 / 20;
  const rad = degrees * Math.PI / 180;
  let vx = speed * Math.cos(rad);
  let vy = speed * Math.sin(rad);
  let x = 0, y = CONTACT_HEIGHT;
  for (let tick = 0; tick < 600; tick++) {
    x += vx;
    y += vy;
    if (y <= 0) break;
    vx *= DRAG;
    vy = vy * DRAG - GRAVITY;
  }
  return x * SPIN_GAIN;
}

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const dirs = args.filter(a => a !== "--dry");
const targets = dirs.length ? dirs : ["csv", "site"];

let changed = 0, files = 0;
targets.forEach(dir => {
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir).filter(f => /\.csv$/i.test(f)).forEach(f => {
    const at = path.join(dir, f);
    const text = fs.readFileSync(at, "utf8");
    const lines = text.replace(/\r/g, "").split("\n");
    if (!lines.length) return;
    const head = lines[0].split(",").map(h => h.trim().toLowerCase());
    // 1 球ごとの記録だけが対象
    if (!head.includes("pitch_no") || !head.includes("distance")) return;
    const ev = head.indexOf("exit_velocity");
    const la = head.indexOf("launch_angle");
    const di = head.indexOf("distance");
    const ri = head.indexOf("result");
    if (ev < 0 || la < 0 || di < 0 || ri < 0) return;

    let touched = 0;
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const cells = lines[i].split(",");
      if (cells[ri] !== "HOME_RUN") continue;
      const speed = Number(cells[ev]), angle = Number(cells[la]);
      if (!isFinite(speed) || speed <= 0 || !isFinite(angle)) continue;
      const want = carry(speed, angle);
      const now = Number(cells[di]) || 0;
      if (Math.abs(want - now) < 0.05) continue;
      if (!dry) {
        cells[di] = want.toFixed(1);
        lines[i] = cells.join(",");
      }
      touched++;
      console.log("  " + at + "  " + cells[head.indexOf("batter")]
        + "  初速 " + speed + "km/h 角度 " + angle + "°  "
        + now.toFixed(1) + "m → " + want.toFixed(1) + "m");
    }
    if (touched) {
      files++;
      changed += touched;
      if (!dry) fs.writeFileSync(at, lines.join("\n"));
    }
  });
});
console.log((dry ? "(直さずに数えました) " : "") + changed + " 本塁打 / " + files + " ファイル");
