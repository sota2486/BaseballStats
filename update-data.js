/*
 * manifest.json を作り直す。
 *
 * <p>GitHub Pages はフォルダの中身を一覧できないので、index.html は
 * 何を読めばよいかをこのファイルから知る。csv や顔画像を足したら 1 回走らせる。
 *
 *   node update-data.js
 *
 * <p>拾うのは site/、index.html と同じ階層、data/ の csv・yml・画像。
 * 同じ名前が複数あれば site/ のものを使う。
 * プラグイン側の設定 (config.yml など) は混ぜない。
 *
 * <p>書き出すのは 2 つの並び。
 * <ul>
 *   <li>files … いま実際にあるファイル。読めなければ画面に知らせる</li>
 *   <li>maybe … まだ無いかもしれないファイル。読めなくても黙って飛ばす</li>
 * </ul>
 * maybe には、顔画像などから分かる選手の「名前.csv」と「名前_play.csv」を
 * 先回りして並べておく。新しく記録が増えたときに、
 * manifest を作り直さなくても読めるようにするため。
 */
const fs = require("fs");
const path = require("path");

/** 混ぜたくないファイル。プラグインの設定やビルドの成果物。 */
const SKIP = new Set(["config.yml", "plugin.yml", "bounce.yml", "package.json",
  "manifest.json", "gradle.properties"]);

const WANT = /\.(csv|ya?ml|png|jpe?g|gif|webp)$/i;
const YAML = /\.ya?ml$/i;
const PICTURE = /^(.+)\.(png|jpe?g|gif|webp)$/i;
const PLAY = /^(.+)_play\.csv$/i;
const CSV = /^(.+)\.csv$/i;

/**
 * サイトが読める yml か。
 *
 * <p>yml はどれも同じ拡張子だが、サイトが読むのは球場(Stadiums:)と
 * 別名表(Players:)の 2 つだけ。プラグインが吐く打席のまとめなどは中身が違うので、
 * 並べても読み飛ばしになるだけ。見出しを見て選り分ける。
 */
function usableYaml(file) {
  try {
    const head = fs.readFileSync(file, "utf8").slice(0, 4000);
    return /^[ \t]*(Stadiums|Players)[ \t]*:/m.test(head);
  } catch (e) {
    return false;
  }
}

function collect(dir, prefix) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => WANT.test(f) && !SKIP.has(f))
    .filter(f => !YAML.test(f) || usableYaml(path.join(dir, f)))
    .map(f => prefix + f);
}

// 同じ名前が複数の場所にあれば手前のものを使う。
// 二重に読むと打席が倍に数えられてしまう。
// site/ を先に見るのは、ここが記録の置き場だから。
// 同じ名前の古い写しが親フォルダに残っていても、そちらに引っぱられない。
const picked = new Map();
[...collect("site", "site/"), ...collect(".", ""), ...collect("data", "data/")]
  .forEach(rel => {
    const base = path.basename(rel);
    if (!picked.has(base)) picked.set(base, rel);
  });
// 名前だけを書く。公開先で site/ に入れていても直下に並べていても、
// index.html 側がどちらも当たってくれる。
const files = [...picked.keys()].sort();

/**
 * その csv が選手ごとの記録か。
 *
 * <p>試合の result は見出しに game_id が入る。選手の名前ではないので名簿に混ぜない。
 * 選手ごとの記録(1 球ごと)は side と pitch_no、守備走塁は kind と touchOrder。
 */
function playerCsv(name) {
  const at = picked.get(name);
  if (!at) return false;
  try {
    const head = fs.readFileSync(at, "utf8").split(/\r?\n/)[0].toLowerCase();
    if (head.includes("game_id")) return false;
    return (head.includes("side") && head.includes("pitch_no"))
        || (head.includes("kind") && head.includes("touchorder"));
  } catch (e) {
    return false;
  }
}

// 選手の名簿。顔画像と、すでにある記録のファイル名から拾う。
// 顔画像のファイル名はプレイヤー名そのものなので、名簿としてちょうどよい。
const names = new Set();
files.forEach(name => {
  const picture = name.match(PICTURE);
  if (picture) {
    names.add(picture[1]);
    return;
  }
  if (!playerCsv(name)) return;
  const play = name.match(PLAY);
  const csv = name.match(CSV);
  if (play) {
    names.add(play[1]);
  } else if (csv) {
    names.add(csv[1]);
  }
});

// まだ無いかもしれない記録。読めなくても知らせない。
const maybe = [];
[...names].sort().forEach(who => {
  [who + ".csv", who + "_play.csv"].forEach(name => {
    if (!picked.has(name)) maybe.push(name);
  });
});

fs.writeFileSync("manifest.json", JSON.stringify({ files, maybe }, null, 2) + "\n");
console.log(files.length + " 件 (+ 先回りぶん " + maybe.length + " 件) を manifest.json に書きました");
