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
  let names=null, base="", why="";
  for(const at of WHERE){
    try{
      const res=await fetch(at, {cache:"no-cache"});
      if(!res.ok){ why=at+" -> HTTP "+res.status; continue; }
      const body=await res.json();
      names=Array.isArray(body) ? body : (body.files||[]);
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
  const url=name => base + name.split("/").map(encodeURIComponent).join("/");
  const pics=names.filter(n=>/\\.(png|jpe?g|gif|webp)$/i.test(n));
  // 別名表を先に読みたいので、yml を前に出す
  const data=names.filter(n=>/\\.(csv|ya?ml)$/i.test(n))
    .sort((a,b)=>{
      const ya=/\\.ya?ml$/i.test(a) ? 0 : 1, yb=/\\.ya?ml$/i.test(b) ? 0 : 1;
      return ya!==yb ? ya-yb : a.localeCompare(b);
    });
  // 顔は画像そのものを参照する。読み込みを待つ必要は無い。
  pics.forEach(n=>{
    FACES[n.split("/").pop().replace(/\\.[^.]+$/,"")]=url(n);
  });
  if(data.length){ DATA.plate=[]; DATA.pitch=[]; DATA.play=[]; DATA.files=[]; SAMPLE=false; }
  for(const name of data){
    try{
      const res=await fetch(url(name), {cache:"no-cache"});
      if(!res.ok) continue;
      if(ingest(await res.text(), name)) DATA.files.push(name);
    }catch(e){ /* 1 つ読めなくても残りは出す */ }
  }
  applyAliases();
  render();
}

/**
 * manifest が読めなかったことを画面に出す。
 *
 * <p>黙ってサンプルに戻ると、置き場所を間違えたのか
 * そもそも読みに行っていないのかが分からない。
 */
function bootFailed(why){
  const bar=document.createElement("div");
  bar.style.cssText="padding:10px 14px; background:#fff4d6; color:#7a4f05;"
    + "border-bottom:1px solid #e8c98a; font-size:13px";
  const local=location.protocol==="file:";
  bar.textContent=local
    ? "manifest.json を読めないため、サンプルを表示しています。"
      + "ブラウザは file:// で開いたページからファイルを読めません。"
      + "GitHub Pages に置くか、このフォルダで簡易サーバを立てて開いてください。"
    : "manifest.json を読めないため、サンプルを表示しています。"
      + " 試した場所: manifest.json / data/manifest.json / site/manifest.json"
      + (why ? "  (" + why + ")" : "");
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
