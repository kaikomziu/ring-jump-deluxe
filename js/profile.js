// RING JUMP DELUXE - player profile: stats, skin unlocks, achievements
window.RJ_PROFILE = (function(){
  "use strict";
  const KEY = "ringjump_profile_v1";

  const SKINS = [
    { id: "default",   name: "バスケ",       emoji: "🏀", cond: s=>true,              condText: "最初から使える" },
    { id: "soccer",    name: "サッカー",     emoji: "⚽", cond: s=>s.bestScore>=10,   condText: "1プレイでスコア10以上" },
    { id: "eightball", name: "エイトボール", emoji: "🎱", cond: s=>s.bestScore>=20,   condText: "1プレイでスコア20以上" },
    { id: "globe",     name: "アース",       emoji: "🌍", cond: s=>s.totalPlays>=10,  condText: "通算10プレイ" },
    { id: "alien",     name: "エイリアン",   emoji: "👾", cond: s=>s.bestCombo>=5,    condText: "SWISHを5連続" },
    { id: "disco",     name: "レインボー",   emoji: "✨", cond: s=>s.bestScore>=40,   condText: "1プレイでスコア40以上" },
    { id: "beach",     name: "ビーチボール", emoji: "🏐", cond: s=>s.mpWins>=1,       condText: "オンライン対戦で1勝" },
  ];

  function s10(s){ return s.totalRingsPassed>=10; }
  const ACHIEVEMENTS = [
    { id:"play1",  icon:"🎮", name:"はじめの一歩",     desc:"1回プレイする",                 cond:s=>s.totalPlays>=1 },
    { id:"play10", icon:"🎮", name:"常連さん",         desc:"通算10回プレイする",            cond:s=>s.totalPlays>=10 },
    { id:"play50", icon:"🎮", name:"やりこみ勢",       desc:"通算50回プレイする",            cond:s=>s.totalPlays>=50 },
    { id:"play100",icon:"🎮", name:"殿堂入り",         desc:"通算100回プレイする",           cond:s=>s.totalPlays>=100 },

    { id:"sc3",   icon:"⭕", name:"ころころビギナー", desc:"1プレイでスコア3達成",         cond:s=>s.bestScore>=3 },
    { id:"sc5",   icon:"⭕", name:"輪くぐり初心者",   desc:"1プレイでスコア5達成",         cond:s=>s.bestScore>=5 },
    { id:"sc10",  icon:"⭕", name:"見習いボール",     desc:"1プレイでスコア10達成",        cond:s=>s.bestScore>=10 },
    { id:"sc15",  icon:"🔥", name:"できるボール",     desc:"1プレイでスコア15達成",        cond:s=>s.bestScore>=15 },
    { id:"sc20",  icon:"🔥", name:"炎の輪マスター",   desc:"1プレイでスコア20達成",        cond:s=>s.bestScore>=20 },
    { id:"sc25",  icon:"🏅", name:"ベテラン",         desc:"1プレイでスコア25達成",        cond:s=>s.bestScore>=25 },
    { id:"sc30",  icon:"🏅", name:"三十輪突破",       desc:"1プレイでスコア30達成",        cond:s=>s.bestScore>=30 },
    { id:"sc40",  icon:"🏆", name:"リングマスター",   desc:"1プレイでスコア40達成",        cond:s=>s.bestScore>=40 },
    { id:"sc50",  icon:"🏆", name:"五十輪の壁",       desc:"1プレイでスコア50達成",        cond:s=>s.bestScore>=50 },
    { id:"sc60",  icon:"👑", name:"輪くぐり神",       desc:"1プレイでスコア60達成",        cond:s=>s.bestScore>=60 },
    { id:"sc80",  icon:"👑", name:"神話級",           desc:"1プレイでスコア80達成",        cond:s=>s.bestScore>=80 },
    { id:"sc100", icon:"🌟", name:"伝説",             desc:"1プレイでスコア100達成",       cond:s=>s.bestScore>=100 },

    { id:"sw1",   icon:"💫", name:"はじめてのSWISH", desc:"SWISHを1回決める",             cond:s=>s.totalSwish>=1 },
    { id:"sw10",  icon:"💫", name:"SWISH見習い",     desc:"通算SWISH10回",                cond:s=>s.totalSwish>=10 },
    { id:"sw50",  icon:"💫", name:"SWISH職人",       desc:"通算SWISH50回",                cond:s=>s.totalSwish>=50 },
    { id:"sw100", icon:"💫", name:"SWISHマイスター", desc:"通算SWISH100回",               cond:s=>s.totalSwish>=100 },
    { id:"sw300", icon:"💫", name:"SWISH伝説",       desc:"通算SWISH300回",               cond:s=>s.totalSwish>=300 },
    { id:"combo3",icon:"⚡", name:"連続ドンピシャ",   desc:"SWISHを3連続で決める",          cond:s=>s.bestCombo>=3 },
    { id:"combo5",icon:"⚡", name:"連続SWISH職人",   desc:"SWISHを5連続で決める",          cond:s=>s.bestCombo>=5 },
    { id:"combo10",icon:"⚡", name:"パーフェクトレーン",desc:"SWISHを10連続で決める",       cond:s=>s.bestCombo>=10 },

    { id:"ring10",  icon:"🕳️", name:"輪コレクター",   desc:"通算でくぐった輪10個",         cond:s10 },
    { id:"ring100", icon:"🕳️", name:"輪ハンター",     desc:"通算でくぐった輪100個",        cond:s=>s.totalRingsPassed>=100 },
    { id:"ring500", icon:"🕳️", name:"輪の支配者",     desc:"通算でくぐった輪500個",        cond:s=>s.totalRingsPassed>=500 },
    { id:"ring1000",icon:"🕳️", name:"輪くぐり王",     desc:"通算でくぐった輪1000個",       cond:s=>s.totalRingsPassed>=1000 },

    { id:"time10m", icon:"⏱️", name:"熱中タイム",     desc:"通算プレイ時間10分",           cond:s=>s.totalPlayTime>=600 },
    { id:"time1h",  icon:"⏱️", name:"時を忘れて",     desc:"通算プレイ時間1時間",          cond:s=>s.totalPlayTime>=3600 },

    { id:"skinall", icon:"🎨", name:"コレクション達成",desc:"全スキンをアンロック",         cond:s=>SKINS.every(sk=>sk.cond(s)) },

    { id:"mp1",    icon:"🌐", name:"初対戦",           desc:"オンライン対戦に初参加",       cond:s=>s.mpPlays>=1 },
    { id:"mpwin1", icon:"🌐", name:"初勝利",           desc:"オンライン対戦で1勝する",      cond:s=>s.mpWins>=1 },
    { id:"mpwin5", icon:"🌐", name:"対戦巧者",         desc:"オンライン対戦で5勝する",      cond:s=>s.mpWins>=5 },
    { id:"mpwin20",icon:"🌐", name:"対戦の覇者",       desc:"オンライン対戦で20勝する",     cond:s=>s.mpWins>=20 },
    { id:"mpperfect",icon:"🌐", name:"完封勝利",       desc:"相手のスコア0で対戦に勝つ",    cond:s=>(s.mpPerfectWins||0)>=1 },
  ];

  function defaultStats(){
    return {
      totalPlays: 0, totalRingsPassed: 0, totalSwish: 0,
      bestScore: 0, bestCombo: 0, totalPlayTime: 0,
      mpPlays: 0, mpWins: 0, mpPerfectWins: 0,
    };
  }
  function load(){
    let d = {};
    try{ d = JSON.parse(localStorage.getItem(KEY) || "{}"); }catch(e){}
    return {
      skin: d.skin || "default",
      stats: Object.assign(defaultStats(), d.stats || {}),
      unlocked: Array.isArray(d.unlocked) ? d.unlocked : [],
    };
  }
  let P = load();
  function save(){ try{ localStorage.setItem(KEY, JSON.stringify(P)); }catch(e){} }

  let onUnlockCb = null;
  function onUnlock(cb){ onUnlockCb = cb; }

  function checkAchievements(){
    const newly = [];
    for (const a of ACHIEVEMENTS){
      if (P.unlocked.indexOf(a.id) === -1 && a.cond(P.stats)){
        P.unlocked.push(a.id);
        newly.push(a);
      }
    }
    if (newly.length){
      save();
      if (onUnlockCb) newly.forEach(onUnlockCb);
    }
    return newly;
  }

  function isSkinUnlocked(id){
    const sk = SKINS.find(x=>x.id===id);
    return sk ? !!sk.cond(P.stats) : false;
  }

  function recordRun(run){
    P.stats.totalPlays++;
    P.stats.totalRingsPassed += run.score||0;
    P.stats.totalSwish += run.swishCount||0;
    P.stats.bestScore = Math.max(P.stats.bestScore, run.score||0);
    P.stats.bestCombo = Math.max(P.stats.bestCombo, run.bestCombo||0);
    P.stats.totalPlayTime += run.playTime||0;
    save();
    return checkAchievements();
  }
  function recordMultiplayer(res){
    P.stats.mpPlays++;
    if (res.won) P.stats.mpWins++;
    if (res.won && (res.opponentScore||0) === 0) P.stats.mpPerfectWins = (P.stats.mpPerfectWins||0) + 1;
    save();
    return checkAchievements();
  }
  function setSkin(id, force){
    if (!force && !isSkinUnlocked(id)) return false;
    P.skin = id;
    save();
    return true;
  }

  return {
    SKINS, ACHIEVEMENTS,
    getSkin: ()=>P.skin,
    setSkin, isSkinUnlocked,
    getStats: ()=>P.stats,
    getUnlockedIds: ()=>P.unlocked.slice(),
    recordRun, recordMultiplayer,
    onUnlock, checkAchievements,
  };
})();
