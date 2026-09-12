/*
 * sbg-savant.html から、GitHub Pages に置ける index.html を作る。
 *
 * <p>変えるところは 3 つ。
 * <ol>
 *   <li>アーティファクトが足してくれていた doctype と head を自分で書く</li>
 *   <li>ファイルを開く・ドロップする口をすべて外す</li>
 *   <li>代わりに manifest.json を読んで、そこに並んだファイルを自分で読み込む</li>
 * </ol>
 *
 * <p>manifest.json は index.html と同じところに置く。中の名前も index.html
 * から見た相対のパスなので、csv を同じ階層に並べても、フォルダに分けてもよい。
 *
 *   node make-index.js
 */
const fs=require("fs"), path=require("path");
let s=fs.readFileSync("sbg-savant.html","utf8");

function sub(a,b){
  const n=s.split(a).length-1;
  if(n!==1){ console.error("MISS("+n+"): "+JSON.stringify(a.slice(0,70))); process.exit(1); }
  s=s.split(a).join(b);
}
const cut=a=>sub(a,"");

/* ---- 1. 読み込みの口を外す ---- */
cut(`      <button id="clear">読み込みを消す</button>\n`);
cut(`      <label class="filebtn">ファイルを開く<input id="file" type="file" accept=".csv,.yml,.yaml,.png,.jpg,.jpeg,.gif,.webp" multiple hidden></label>\n`);
cut(`<div id="drop">
  <span id="dropLabel">result / record の csv、stadium.yml、顔画像(ファイル名 = プレイヤー名)をまとめてドロップ</span>
  <span class="badge warn" id="sampleNote">サンプルデータを表示中</span>
  <span class="badge ok" id="loaded" hidden></span>
</div>

`);
cut(`document.getElementById("file").addEventListener("change",e=>loadFiles(e.target.files));\n`);
sub(`const drop=document.getElementById("drop");
["dragenter","dragover"].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add("over");}));
["dragleave","drop"].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove("over");}));
drop.addEventListener("drop",e=>loadFiles(e.dataTransfer.files));
document.getElementById("clear").addEventListener("click",clearAll);
`, "");

/* ---- 2. 読み込みを manifest から取ってくる形に差し替える ---- */
const from=s.indexOf("function loadFiles(files){");
const to=s.indexOf("/** 球場を選ぶ欄を、読み込んである球場で作り直す。 */");
if(from<0||to<0||to<from){ console.error("MISS loader"); process.exit(1); }
s=s.slice(0,from)+`/**
 * manifest.json に並んだファイルを読み込む。
 *
 * <p>置き場所は index.html と同じところ。名前は index.html から見た相対のパスで、
 * csv・yml と顔画像(ファイル名 = プレイヤー名)を並べる。
 *
 *   {"files": ["2026090801.csv", "sota2486.png", "players.yml"]}
 *
 * <p>manifest.json が無ければサンプルのまま表示する。
 */
async function bootFromData(){
  // manifest はここのどれかにある。上から順に探す。
  const WHERE=["manifest.json", "data/manifest.json", "site/manifest.json"];
  let names=null, maybe=[], base="", why="";
  for(const at of WHERE){
    try{
      const res=await fetch(at, {cache:"no-cache"});
      if(!res.ok){ why=at+" -> HTTP "+res.status; continue; }
      const body=await res.json();
      names=Array.isArray(body) ? body : (body.files||[]);
      // maybe はまだ無いかもしれないファイル。無くても知らせない。
      maybe=Array.isArray(body) ? [] : (body.maybe||[]);
      // manifest の中の名前は、その manifest から見た相対のパス
      base=at.slice(0, at.lastIndexOf("/")+1);
      break;
    }catch(e){
      why=at+" -> "+(e && e.message ? e.message : e);
    }
  }
  if(!names){
    bootFailed(why);
    render();
    return;
  }
  const enc=name => name.split("/").map(encodeURIComponent).join("/");
  // 置き場所が変わっても拾えるよう、いくつか当たってみる。
  // 手元では site/ に入れていても、公開先では直下に並べていることがある。
  // site/ を先に見る。古い写しが直下に残っていると、そちらに引っぱられるため。
  const WHERE_FILE=["site/", "csv/", "", "data/"];
  // 一度どこで見つかったかを覚えておき、次からはそこだけ見る。
  // 毎回 3 か所当たると、ファイルの数だけ無駄な 404 が積み上がる。
  let goodDir=null;
  const candidates=name => {
    const only=name.split("/").pop();
    // 覚えたフォルダを先に当てて無駄な 404 を減らすが、そこに無ければ
    // ほかのフォルダも当たり直す。フォルダをまたいで置いてあっても読めるように。
    const dirs=goodDir===null ? WHERE_FILE
      : [goodDir, ...WHERE_FILE.filter(d=>d!==goodDir)];
    const list=name.includes("/") ? [base+enc(name)] : [];
    dirs.forEach(dir=>{
      const at=base+dir+enc(only);
      if(!list.includes(at)) list.push(at);
    });
    return list;
  };
  /** どこかに見つかるまで順に当たる。 */
  const grab=async name => {
    const only=name.split("/").pop();
    let last="";
    for(const at of candidates(name)){
      try{
        const res=await fetch(at, {cache:"no-cache"});
        if(res.ok){
          // どのフォルダで見つかったかを覚える
          WHERE_FILE.forEach(dir=>{
            if(at===base+dir+enc(only)) goodDir=dir;
          });
          return {at, text:await res.text()};
        }
        last=at+" -> HTTP "+res.status;
      }catch(e){
        last=at+" -> "+(e && e.message ? e.message : e);
      }
    }
    return {at:null, why:last};
  };
  // 写真は manifest に無いものも当たってみる(球場の写真を後から置いたとき用)
  const pics=names.filter(n=>/\\.(png|jpe?g|gif|webp)$/i.test(n))
    .concat(maybe.filter(n=>/\\.(png|jpe?g|gif|webp)$/i.test(n)));
  // 別名表を先に読みたいので、yml を前に出す
  const data=names.filter(n=>/\\.(csv|ya?ml)$/i.test(n))
    .sort((a,b)=>{
      const ya=/\\.ya?ml$/i.test(a) ? 0 : 1, yb=/\\.ya?ml$/i.test(b) ? 0 : 1;
      return ya!==yb ? ya-yb : a.localeCompare(b);
    });
  // 顔は画像そのものを参照する。読み込みを待つ必要は無い。
  // 置き場所が違っていても出るよう、img が出せなければ次の候補へ移る。
  pics.forEach(n=>{
    const where=candidates(n);
    FACES[n.split("/").pop().replace(/\\.[^.]+$/,"")]=where[0];
    FACE_ALT[where[0]]=where.slice(1);
  });
  if(data.length){ DATA.plate=[]; DATA.pitch=[]; DATA.play=[]; DATA.files=[];
    GAMES.clear(); forgetSeen(); SAMPLE=false; }
  const missing=[];
  // 置き場所を決めるために 1 つだけ先に取る。
  // ここで goodDir が決まるので、残りは無駄な 404 を出さずに済む。
  if(data.length){
    const first=await grab(data[0]);
    if(!first.at) missing.push(first.why);
    else if(ingest(first.text, data[0])) DATA.files.push(data[0]);
    else missing.push(first.at+" -> 中身が result / record / play のどれでもない");
  }
  // 残りはまとめて取ってから、並びどおりに読み込む。
  // 1 つずつ待っていると、ファイルの数だけ待ち時間が積み上がって画面が出ない。
  const rest=data.slice(1);
  const fetched=await Promise.all(rest.map(grab));
  rest.forEach((name, i)=>{
    const got=fetched[i];
    if(!got.at){ missing.push(got.why); return; }
    if(ingest(got.text, name)) DATA.files.push(name);
    else missing.push(got.at+" -> 中身が result / record / play のどれでもない");
  });
  // 先回りぶん。まだ置かれていなくても普通のことなので、黙って飛ばす。
  const later=maybe.filter(n=>/\.(csv|ya?ml)$/i.test(n) && !DATA.files.includes(n));
  const extra=await Promise.all(later.map(grab));
  later.forEach((name, i)=>{
    const got=extra[i];
    if(got.at && ingest(got.text, name)) DATA.files.push(name);
  });
  if(!DATA.files.length){
    // 1 つも読めなかった。空の画面を出すよりサンプルに戻す。
    SAMPLE=true;
    ingest(SAMPLE_RESULT);
    ingest(SAMPLE_RECORD);
    bootFailed("manifest は読めたが、中のファイルを 1 つも読めなかった", missing);
  }else if(missing.length){
    bootFailed(DATA.files.length+" 件は読めたが、読めなかったものがある", missing);
  }
  applyAliases();
  render();
}

/**
 * 顔画像の代わりの置き場所。最初の場所で出なければ次を試す。
 */
const FACE_ALT={};
document.addEventListener("error", event => {
  const img=event.target;
  if(!img || img.tagName!=="IMG") return;
  const next=(FACE_ALT[img.getAttribute("src")]||[]).slice();
  if(!next.length) return;
  const now=next.shift();
  FACE_ALT[now]=next;
  img.src=now;
}, true);

/**
 * manifest が読めなかったことを画面に出す。
 *
 * <p>黙ってサンプルに戻ると、置き場所を間違えたのか
 * そもそも読みに行っていないのかが分からない。
 */
function bootFailed(why, missing){
  const bar=document.createElement("div");
  bar.style.cssText="padding:10px 14px; background:#fff4d6; color:#7a4f05;"
    + "border-bottom:1px solid #e8c98a; font-size:13px; line-height:1.7";
  if(location.protocol==="file:"){
    bar.textContent="ファイルを読めないため、サンプルを表示しています。"
      + "ブラウザは file:// で開いたページからファイルを読めません。"
      + "GitHub Pages に置くか、このフォルダで簡易サーバを立てて開いてください。";
  }else{
    const NL=String.fromCharCode(10);
    const list=(missing||[]).slice(0,6).map(one=>"・"+one).join(NL);
    const more=(missing||[]).length>6
      ? NL+"ほか "+((missing||[]).length-6)+" 件" : "";
    bar.style.whiteSpace="pre-wrap";
    bar.textContent=why
      + (list ? NL+list+more : "")
      + NL+"読みに来た場所: "+location.href;
  }
  document.body.insertBefore(bar, document.getElementById("app"));
}
`+s.slice(to);

/* ---- 3. 起動 ---- */
sub(`loadFaces();
ingest(SAMPLE_RESULT);
ingest(SAMPLE_RECORD);
render();
</script>`,
`loadFaces();
ingest(SAMPLE_RESULT);
ingest(SAMPLE_RECORD);
bootFromData();
</script>`);

/* ---- 4. head と body を自分で書く ---- */
s=s.replace(/^<meta charset="utf-8">\n/, "");
sub(`*{box-sizing:border-box}
body{background:var(--ground); color:var(--text);`,
`*{box-sizing:border-box}
img{max-width:100%}
[hidden]{display:none!important}
body{margin:0; background:var(--ground); color:var(--text);`);
const styleEnd=s.indexOf("</style>")+"</style>".length;
s=`<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
`+s.slice(0,styleEnd)+"\n</head>\n<body>"+s.slice(styleEnd)+"\n</body>\n</html>\n";

fs.writeFileSync("index.html", s);
console.log("index.html", s.length, "bytes");

/* ---- 5. manifest を作り直す ---- */
require("./update-data.js");
