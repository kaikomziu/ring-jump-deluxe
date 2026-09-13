// RING JUMP DELUXE - game logic (Flappy Bird-style: tap to flap, floating flame hoops)
(function(){
  "use strict";

  // ---------- canvas / sizing ----------
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const wrap = document.getElementById("wrap");

  const LW = 480, LH = 800; // logical resolution
  let dpr = 1;

  function resize(){
    const rect = wrap.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const scale = Math.min(canvas.width / LW, canvas.height / LH);
    scaleX = scale; scaleY = scale;
    offX = (canvas.width - LW * scale) / 2;
    offY = (canvas.height - LH * scale) / 2;
  }
  let scaleX = 1, scaleY = 1, offX = 0, offY = 0;
  window.addEventListener("resize", resize);
  resize();

  // ---------- audio ----------
  let actx = null;
  function ensureAudio(){
    if (!actx){
      try{ actx = new (window.AudioContext || window.webkitAudioContext)(); }catch(e){}
    }
    if (actx && actx.state === "suspended") actx.resume();
  }
  function beep(freq, dur, type, vol, when, slideTo){
    if (!actx) return;
    const t0 = actx.currentTime + (when||0);
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    osc.type = type || "sine";
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20,slideTo), t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol||0.2, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain); gain.connect(actx.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }
  function sfxFlap(){ beep(500, 0.09, "triangle", 0.16, 0, 640); }
  function sfxScore(){ beep(880, 0.1, "sine", 0.2, 0); beep(1180, 0.12, "sine", 0.16, 0.05); }
  function sfxSwish(){ beep(1050, 0.09, "sine", 0.2, 0); beep(1400, 0.1, "sine", 0.18, 0.05); beep(1760, 0.14, "sine", 0.16, 0.1); }
  function sfxHit(){ beep(150, 0.35, "sawtooth", 0.28, 0, 40); }

  // ---------- constants ----------
  const DEATH_TOP = 6;               // touching the very top = game over
  const DEATH_BOTTOM = LH - 6;       // touching the very bottom = game over
  const BALL_X = 140;
  const BALL_R = 22;
  const DEFAULT_GRAVITY = 1500;      // px/s^2
  const DEFAULT_FLAP_V = -430;       // velocity set on every flap (tap)

  const BEST_KEY = "ringjump_best_v2";

  // ---------- admin / cheat mode ----------
  const ADMIN_KEY = "ringjump_admin_v1";
  const ADMIN_PASSWORD = "karubiwakame20151105";
  const ADMIN_TRIGGER = "admin";
  const PROFILE = window.RJ_PROFILE;

  function loadAdmin(){
    let saved = {};
    try{ saved = JSON.parse(localStorage.getItem(ADMIN_KEY) || "{}"); }catch(e){}
    return {
      unlocked: !!saved.unlocked,
      invincible: !!saved.invincible,
      gravity: typeof saved.gravity === "number" ? saved.gravity : DEFAULT_GRAVITY,
      flapV: typeof saved.flapV === "number" ? saved.flapV : DEFAULT_FLAP_V,
      speedMul: typeof saved.speedMul === "number" ? saved.speedMul : 1,
    };
  }
  function saveAdmin(){
    try{ localStorage.setItem(ADMIN_KEY, JSON.stringify(admin)); }catch(e){}
  }
  const admin = loadAdmin();

  let state = "title"; // title | playing | paused | gameover
  let stateBeforePause = "playing";
  let ball = null;
  let rings = [];
  let particles = [];
  let popups = [];
  let bricks = [];
  let score = 0;
  let combo = 0;
  let runSwishCount = 0;
  let runBestCombo = 0;
  let best = Number(localStorage.getItem(BEST_KEY) || 0);
  let speed = 240;
  let spawnTimer = 0;
  let spawnGap = 1.7;
  let shake = 0;
  let flashRed = 0;
  let lastT = 0;
  let squash = 1;
  let titleT = 0;
  let elapsed = 0;      // playing-time clock (drives moving rings)
  let flapPulse = 0;    // wing-flap animation energy
  let tilt = 0;         // ball body tilt (velocity based)

  // ---------- online versus ----------
  function mulberry32(seed){
    let a = seed >>> 0;
    return function(){
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  let mode = "solo"; // solo | online
  let rng = Math.random;
  let onlineSession = null;
  let onlineSendTimer = 0;
  let matchOver = false;
  let myFinal = null, peerFinal = null;
  let peerState = { y: LH/2, score: 0, alive: true };

  const els = {
    hud: document.getElementById("hud"),
    score: document.getElementById("score"),
    bestMini: document.getElementById("bestMini"),
    bestMiniWrap: document.getElementById("bestMiniWrap"),
    vsHud: document.getElementById("vsHud"),
    peerScore: document.getElementById("peerScore"),
    pauseBtn: document.getElementById("pauseBtn"),
    titleScreen: document.getElementById("titleScreen"),
    resultScreen: document.getElementById("resultScreen"),
    resultTitle: document.getElementById("resultTitle"),
    resultRank: document.getElementById("resultRank"),
    finalScore: document.getElementById("finalScore"),
    finalBest: document.getElementById("finalBest"),
    newBestTag: document.getElementById("newBestTag"),
    startBtn: document.getElementById("startBtn"),
    retryBtn: document.getElementById("retryBtn"),
    titleBtn: document.getElementById("titleBtn"),
    pauseScreen: document.getElementById("pauseScreen"),
    resumeBtn: document.getElementById("resumeBtn"),
    pauseTitleBtn: document.getElementById("pauseTitleBtn"),
    skinsBtn: document.getElementById("skinsBtn"),
    skinScreen: document.getElementById("skinScreen"),
    skinGrid: document.getElementById("skinGrid"),
    skinsBackBtn: document.getElementById("skinsBackBtn"),
    achBtn: document.getElementById("achBtn"),
    achScreen: document.getElementById("achScreen"),
    achList: document.getElementById("achList"),
    achProgress: document.getElementById("achProgress"),
    achBackBtn: document.getElementById("achBackBtn"),
    achToast: document.getElementById("achToast"),
    achToastName: document.getElementById("achToastName"),
    onlineBtn: document.getElementById("onlineBtn"),
    onlineScreen: document.getElementById("onlineScreen"),
    createRoomBtn: document.getElementById("createRoomBtn"),
    roomCodeInput: document.getElementById("roomCodeInput"),
    joinRoomBtn: document.getElementById("joinRoomBtn"),
    onlineErr: document.getElementById("onlineErr"),
    onlineBackBtn: document.getElementById("onlineBackBtn"),
    onlineWaitScreen: document.getElementById("onlineWaitScreen"),
    onlineWaitTitle: document.getElementById("onlineWaitTitle"),
    onlineWaitCode: document.getElementById("onlineWaitCode"),
    onlineWaitSub: document.getElementById("onlineWaitSub"),
    onlineCancelBtn: document.getElementById("onlineCancelBtn"),
    countdownScreen: document.getElementById("countdownScreen"),
    countdownNum: document.getElementById("countdownNum"),
    onlineResultScreen: document.getElementById("onlineResultScreen"),
    onlineResultTitle: document.getElementById("onlineResultTitle"),
    onlineMyScore: document.getElementById("onlineMyScore"),
    onlineOppScore: document.getElementById("onlineOppScore"),
    onlineRetryBtn: document.getElementById("onlineRetryBtn"),
    onlineTitleBtn: document.getElementById("onlineTitleBtn"),
  };
  els.bestMini.textContent = best;

  function ranks(s){
    if (s >= 60) return "輪くぐり神";
    if (s >= 40) return "リングマスター";
    if (s >= 25) return "ベテラン";
    if (s >= 15) return "できるボール";
    if (s >= 8) return "見習いボール";
    if (s >= 3) return "ころころビギナー";
    return "まだまだこれから";
  }

  function initBricks(){
    bricks = [];
    for (let i=0;i<9;i++){
      bricks.push({
        x: Math.random()*LW,
        y: Math.random()*LH,
        w: 46 + Math.random()*40,
        h: 26 + Math.random()*18,
        mul: 0.12 + Math.random()*0.22,
        a: 0.16 + Math.random()*0.14,
      });
    }
  }
  initBricks();

  function resetGame(){
    ball = { y: LH/2, vy: 0 };
    rings = [];
    particles = [];
    popups = [];
    score = 0;
    combo = 0;
    runSwishCount = 0;
    runBestCombo = 0;
    speed = 240;
    spawnTimer = 0;
    spawnGap = 1.7;
    shake = 0; flashRed = 0;
    squash = 1;
    elapsed = 0;
    flapPulse = 0;
    tilt = 0;
    els.score.textContent = "0";
  }

  function startGame(seed){
    ensureAudio();
    mode = (typeof seed === "number") ? "online" : "solo";
    rng = (mode === "online") ? mulberry32(seed) : Math.random;
    resetGame();
    state = "playing";
    els.titleScreen.classList.add("hidden");
    els.resultScreen.classList.add("hidden");
    els.pauseScreen.classList.add("hidden");
    els.onlineResultScreen.classList.add("hidden");
    els.hud.classList.remove("hidden");
    els.pauseBtn.classList.toggle("hidden", mode === "online");
    els.vsHud.classList.toggle("hidden", mode !== "online");
    els.bestMiniWrap.classList.toggle("hidden", mode === "online");
  }

  function hidePlayUI(){
    els.hud.classList.add("hidden");
    els.pauseBtn.classList.add("hidden");
  }

  function difficultyInnerR(){
    const t = Math.min(score / 28, 1);
    return 100 - t * 40; // 100 -> 60
  }
  function difficultySpeed(){
    return Math.min(240 + score * 7, 520) * admin.speedMul;
  }
  function difficultySpawnGap(){
    return Math.max(1.7 - score * 0.02, 1.05);
  }

  function spawnRing(){
    const innerR = difficultyInnerR();
    const margin = 70;
    const minC = DEATH_TOP + innerR + margin;
    const maxC = DEATH_BOTTOM - innerR - margin;
    const baseY = minC + rng() * Math.max(10, maxC - minC);
    const hue = [16, 42, 330, 200, 275][rings.length % 5];
    const moving = score >= 12 && rng() < 0.45;
    const moveAmp = moving ? Math.min(50 + rng()*70, baseY - DEATH_TOP - innerR - 10, DEATH_BOTTOM - innerR - 10 - baseY) : 0;
    const isMoving = moving && moveAmp > 15;
    rings.push({
      x: LW + 70,
      baseY,
      innerR,
      passed: false,
      hue,
      tilt: isMoving ? (rng()<0.5 ? -1 : 1) * (18 + rng()*10) * Math.PI/180 : 0,
      moving: isMoving,
      moveAmp: Math.max(0, moveAmp),
      moveSpeed: 1.1 + rng()*0.9,
      movePhase: rng()*Math.PI*2,
      flameSeed: rng()*100,
    });
  }
  function ringY(r){
    return r.moving ? r.baseY + Math.sin(elapsed*r.moveSpeed + r.movePhase)*r.moveAmp : r.baseY;
  }

  function burst(x, y, color, n){
    for (let i=0;i<n;i++){
      const a = Math.random()*Math.PI*2;
      const sp = 60 + Math.random()*180;
      particles.push({
        x, y, vx: Math.cos(a)*sp, vy: Math.sin(a)*sp,
        life: 0.5 + Math.random()*0.4, t: 0, color, r: 2+Math.random()*3,
      });
    }
  }
  function popup(x, y, text, color){
    popups.push({ x, y, text, color, t: 0, life: 0.7 });
  }

  function flap(){
    if (state !== "playing") return;
    ball.vy = admin.flapV;
    squash = 1.28;
    flapPulse = 1;
    sfxFlap();
    burst(BALL_X-10, ball.y+10, "255,255,255", 4);
  }

  function gameOver(){
    if (mode === "online"){ onlineOnDeath(); return; }
    state = "gameover";
    shake = 1;
    flashRed = 1;
    sfxHit();
    hidePlayUI();
    const isNew = score > best;
    if (isNew){ best = score; localStorage.setItem(BEST_KEY, String(best)); }
    els.bestMini.textContent = best;
    const newlyUnlocked = PROFILE.recordRun({
      score, swishCount: runSwishCount, bestCombo: runBestCombo, playTime: elapsed,
    });
    setTimeout(()=>{
      els.finalScore.textContent = score;
      els.finalBest.textContent = best;
      els.resultRank.textContent = ranks(score);
      els.newBestTag.classList.toggle("hidden", !isNew);
      els.resultScreen.classList.remove("hidden");
      queueAchievementToasts(newlyUnlocked);
    }, 550);
  }

  function togglePause(){
    if (mode === "online") return; // 対戦中は一時停止できない
    if (state === "playing"){
      state = "paused";
      els.pauseScreen.classList.remove("hidden");
    } else if (state === "paused"){
      state = "playing";
      els.pauseScreen.classList.add("hidden");
    }
  }

  // ---------- input ----------
  function onDown(e){
    if (e.cancelable) e.preventDefault();
    if (state === "title"){ startGame(); return; }
    if (state === "playing"){ flap(); return; }
  }
  canvas.addEventListener("pointerdown", onDown, {passive:false});
  window.addEventListener("keydown", (e)=>{
    const tag = e.target && e.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (e.code === "Space" || e.code === "ArrowUp"){
      if (e.repeat) return;
      if (e.cancelable) e.preventDefault();
      if (state === "title") startGame();
      else if (state === "playing") flap();
    }
    if (e.code === "Escape" && (state === "playing" || state === "paused")){
      togglePause();
    }
  });
  els.startBtn.addEventListener("click", startGame);
  els.retryBtn.addEventListener("click", startGame);
  els.titleBtn.addEventListener("click", ()=>{
    state = "title";
    els.resultScreen.classList.add("hidden");
    els.titleScreen.classList.remove("hidden");
  });
  els.pauseBtn.addEventListener("click", (e)=>{ e.stopPropagation(); togglePause(); });
  els.resumeBtn.addEventListener("click", togglePause);
  els.pauseTitleBtn.addEventListener("click", ()=>{
    state = "title";
    els.pauseScreen.classList.add("hidden");
    els.hud.classList.add("hidden");
    els.pauseBtn.classList.add("hidden");
    els.titleScreen.classList.remove("hidden");
  });

  // ---------- skins & achievements UI ----------
  function buildSkinGrid(){
    els.skinGrid.innerHTML = "";
    const cur = PROFILE.getSkin();
    PROFILE.SKINS.forEach(s=>{
      const unlocked = PROFILE.isSkinUnlocked(s.id);
      const card = document.createElement("div");
      card.className = "skinCard" + (s.id===cur ? " active" : "") + (unlocked ? "" : " locked");
      card.innerHTML = `<span class="emoji">${s.emoji}</span><span class="name">${s.name}</span>` +
        (unlocked ? "" : `<div class="cond">🔒 ${s.condText}</div>`);
      if (unlocked){
        card.addEventListener("click", ()=>{
          PROFILE.setSkin(s.id, false);
          buildSkinGrid();
        });
      }
      els.skinGrid.appendChild(card);
    });
  }
  function buildAchList(){
    const unlockedIds = PROFILE.getUnlockedIds();
    els.achProgress.textContent = `達成 ${unlockedIds.length} / ${PROFILE.ACHIEVEMENTS.length}`;
    els.achList.innerHTML = "";
    PROFILE.ACHIEVEMENTS.forEach(a=>{
      const done = unlockedIds.indexOf(a.id) !== -1;
      const row = document.createElement("div");
      row.className = "achRow" + (done ? " done" : " locked");
      row.innerHTML = `<span class="icon">${done ? a.icon : "🔒"}</span>` +
        `<div class="info"><div class="aname">${a.name}</div><div class="adesc">${a.desc}</div></div>`;
      els.achList.appendChild(row);
    });
  }
  els.skinsBtn.addEventListener("click", ()=>{
    buildSkinGrid();
    els.titleScreen.classList.add("hidden");
    els.skinScreen.classList.remove("hidden");
  });
  els.skinsBackBtn.addEventListener("click", ()=>{
    els.skinScreen.classList.add("hidden");
    els.titleScreen.classList.remove("hidden");
  });
  els.achBtn.addEventListener("click", ()=>{
    buildAchList();
    els.titleScreen.classList.add("hidden");
    els.achScreen.classList.remove("hidden");
  });
  els.achBackBtn.addEventListener("click", ()=>{
    els.achScreen.classList.add("hidden");
    els.titleScreen.classList.remove("hidden");
  });

  let toastQueue = [];
  let toastShowing = false;
  function queueAchievementToasts(list){
    if (!list || !list.length) return;
    toastQueue.push(...list);
    if (!toastShowing) showNextToast();
  }
  function showNextToast(){
    const a = toastQueue.shift();
    if (!a){ toastShowing = false; return; }
    toastShowing = true;
    els.achToast.querySelector(".icon").textContent = a.icon;
    els.achToastName.textContent = a.name;
    els.achToast.classList.add("show");
    setTimeout(()=>{
      els.achToast.classList.remove("show");
      setTimeout(showNextToast, 350);
    }, 2400);
  }

  // ---------- online versus: matchmaking & resolution ----------
  function setupOnlineHandlers(){
    onlineSession.on("peerJoined", ()=>{
      if (onlineSession.role === "host"){
        const seed = Math.floor(Math.random()*4294967295);
        const startAt = Date.now() + 3000;
        onlineSession.send("start", { seed, startAt });
        beginCountdownTo(startAt, seed);
      }
    });
    onlineSession.on("peerLeft", ()=>{
      if (mode === "online" && state === "playing" && !matchOver){
        matchOver = true;
        myFinal = { score, survivalTime: elapsed };
        hidePlayUI();
        state = "gameover";
        showOnlineResult(true, score, peerState.score);
      }
    });
    onlineSession.on("start", (data)=>{
      beginCountdownTo(data.startAt, data.seed);
    });
    onlineSession.on("state", (data)=>{
      peerState.y = data.y;
      peerState.score = data.score;
      peerState.alive = data.alive !== false;
      els.peerScore.textContent = peerState.score;
    });
    onlineSession.on("over", (data)=>{
      peerFinal = data;
      peerState.score = data.score;
      peerState.alive = false;
      els.peerScore.textContent = data.score;
      if (mode === "online" && state === "playing" && !matchOver){
        matchOver = true;
        myFinal = { score, survivalTime: elapsed };
        hidePlayUI();
        state = "gameover";
        showOnlineResult(true, score, data.score);
      }
    });
  }

  function onlineOnDeath(){
    if (matchOver) return;
    matchOver = true;
    const final = { score, survivalTime: elapsed };
    myFinal = final;
    const won = !!peerFinal; // peer already reported death earlier -> they died first -> I win
    shake = 1; flashRed = 1; sfxHit();
    if (onlineSession) onlineSession.send("over", final);
    setTimeout(()=>{
      hidePlayUI();
      showOnlineResult(won, final.score, peerFinal ? peerFinal.score : peerState.score);
    }, 550);
  }

  function showOnlineResult(won, myScore, oppScore){
    const newlyUnlocked = PROFILE.recordMultiplayer({ won, opponentScore: oppScore });
    els.onlineResultTitle.textContent = won ? "🏆 WIN!" : "😢 LOSE...";
    els.onlineMyScore.textContent = myScore;
    els.onlineOppScore.textContent = oppScore;
    els.vsHud.classList.add("hidden");
    els.onlineResultScreen.classList.remove("hidden");
    queueAchievementToasts(newlyUnlocked);
  }

  function beginCountdownTo(startAt, seed){
    els.onlineWaitScreen.classList.add("hidden");
    els.countdownScreen.classList.remove("hidden");
    function tick(){
      const remain = startAt - Date.now();
      const n = Math.ceil(remain/1000);
      if (remain <= 0){
        els.countdownScreen.classList.add("hidden");
        beginOnlineMatch(seed);
        return;
      }
      els.countdownNum.textContent = n > 0 ? String(n) : "GO!";
      requestAnimationFrame(tick);
    }
    tick();
  }

  function beginOnlineMatch(seed){
    matchOver = false;
    myFinal = null; peerFinal = null;
    peerState = { y: LH/2, score: 0, alive: true };
    onlineSendTimer = 0;
    els.peerScore.textContent = "0";
    startGame(seed);
  }

  function leaveOnlineSession(){
    if (onlineSession){ onlineSession.leave(); onlineSession = null; }
  }

  function showOnlineWait(code, isHost){
    els.onlineScreen.classList.add("hidden");
    els.onlineWaitCode.textContent = code;
    els.onlineWaitTitle.textContent = isHost ? "相手を待っています…" : "ホストの開始を待っています…";
    els.onlineWaitSub.textContent = isHost ? "この5桁のコードを相手に伝えてね" : "";
    els.onlineWaitScreen.classList.remove("hidden");
  }

  els.onlineBtn.addEventListener("click", ()=>{
    els.onlineErr.textContent = "";
    els.roomCodeInput.value = "";
    els.titleScreen.classList.add("hidden");
    els.onlineScreen.classList.remove("hidden");
  });
  els.onlineBackBtn.addEventListener("click", ()=>{
    els.onlineScreen.classList.add("hidden");
    els.titleScreen.classList.remove("hidden");
  });
  els.createRoomBtn.addEventListener("click", async ()=>{
    els.onlineErr.textContent = "接続中…";
    try{
      onlineSession = new window.RJOnlineSession();
      setupOnlineHandlers();
      const code = await onlineSession.createRoom();
      els.onlineErr.textContent = "";
      showOnlineWait(code, true);
    }catch(e){
      els.onlineErr.textContent = "接続に失敗しました。通信環境を確認してください。";
      leaveOnlineSession();
    }
  });
  els.joinRoomBtn.addEventListener("click", async ()=>{
    const code = els.roomCodeInput.value.trim();
    if (code.length < 4){ els.onlineErr.textContent = "コードを入力してください"; return; }
    els.onlineErr.textContent = "接続中…";
    try{
      onlineSession = new window.RJOnlineSession();
      setupOnlineHandlers();
      await onlineSession.joinRoom(code);
      els.onlineErr.textContent = "";
      showOnlineWait(code.toUpperCase(), false);
    }catch(e){
      els.onlineErr.textContent = "部屋が見つかりません。コードを確認してください。";
      leaveOnlineSession();
    }
  });
  els.onlineCancelBtn.addEventListener("click", ()=>{
    leaveOnlineSession();
    els.onlineWaitScreen.classList.add("hidden");
    els.titleScreen.classList.remove("hidden");
  });
  els.onlineTitleBtn.addEventListener("click", ()=>{
    leaveOnlineSession();
    mode = "solo";
    els.onlineResultScreen.classList.add("hidden");
    els.titleScreen.classList.remove("hidden");
  });
  els.onlineRetryBtn.addEventListener("click", ()=>{
    leaveOnlineSession();
    mode = "solo";
    els.onlineResultScreen.classList.add("hidden");
    els.onlineErr.textContent = "";
    els.onlineScreen.classList.remove("hidden");
  });

  // ---------- admin UI ----------
  const adminEls = {
    passScreen: document.getElementById("adminPassScreen"),
    passInput: document.getElementById("adminPassInput"),
    passMsg: document.getElementById("adminPassMsg"),
    passOk: document.getElementById("adminPassOk"),
    passCancel: document.getElementById("adminPassCancel"),
    gearBtn: document.getElementById("adminGearBtn"),
    panel: document.getElementById("adminPanel"),
    skins: document.getElementById("adminSkins"),
    invincible: document.getElementById("adminInvincible"),
    scoreInput: document.getElementById("adminScoreInput"),
    scoreApply: document.getElementById("adminScoreApply"),
    gravity: document.getElementById("adminGravity"),
    gravityVal: document.getElementById("adminGravityVal"),
    flap: document.getElementById("adminFlap"),
    flapVal: document.getElementById("adminFlapVal"),
    speedMul: document.getElementById("adminSpeedMul"),
    speedMulVal: document.getElementById("adminSpeedMulVal"),
    resetPhysics: document.getElementById("adminResetPhysics"),
    panelClose: document.getElementById("adminPanelClose"),
  };

  // secret trigger: type "admin" anywhere (not while typing in a field)
  let keyBuffer = "";
  window.addEventListener("keydown", (e)=>{
    const tag = e.target && e.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (e.key && e.key.length === 1){
      keyBuffer = (keyBuffer + e.key.toLowerCase()).slice(-ADMIN_TRIGGER.length);
      if (keyBuffer === ADMIN_TRIGGER){
        keyBuffer = "";
        openPasswordModal();
      }
    }
  });

  function openPasswordModal(){
    adminEls.passMsg.textContent = "";
    adminEls.passInput.value = "";
    adminEls.passScreen.classList.remove("hidden");
    setTimeout(()=>adminEls.passInput.focus(), 30);
  }
  function closePasswordModal(){
    adminEls.passScreen.classList.add("hidden");
  }
  function tryPassword(){
    if (adminEls.passInput.value === ADMIN_PASSWORD){
      admin.unlocked = true;
      saveAdmin();
      closePasswordModal();
      adminEls.gearBtn.classList.remove("hidden");
      openAdminPanel();
    } else {
      adminEls.passMsg.textContent = "パスワードが違います";
      adminEls.passScreen.classList.remove("shake");
      void adminEls.passScreen.offsetWidth;
      adminEls.passScreen.classList.add("shake");
      adminEls.passInput.value = "";
      adminEls.passInput.focus();
    }
  }
  adminEls.passOk.addEventListener("click", tryPassword);
  adminEls.passCancel.addEventListener("click", closePasswordModal);
  adminEls.passInput.addEventListener("keydown", (e)=>{
    if (e.key === "Enter") tryPassword();
    if (e.key === "Escape") closePasswordModal();
  });

  function buildSkinButtons(){
    adminEls.skins.innerHTML = "";
    PROFILE.SKINS.forEach(s=>{
      const b = document.createElement("button");
      b.textContent = s.emoji;
      b.title = s.name + "(強制解放)";
      b.className = PROFILE.getSkin() === s.id ? "active" : "";
      b.addEventListener("click", ()=>{
        PROFILE.setSkin(s.id, true); // admin bypasses unlock conditions
        buildSkinButtons();
      });
      adminEls.skins.appendChild(b);
    });
  }

  function syncAdminPanel(){
    buildSkinButtons();
    adminEls.invincible.checked = admin.invincible;
    adminEls.scoreInput.value = score;
    adminEls.gravity.value = admin.gravity;
    adminEls.gravityVal.textContent = Math.round(admin.gravity);
    adminEls.flap.value = admin.flapV;
    adminEls.flapVal.textContent = Math.round(admin.flapV);
    adminEls.speedMul.value = admin.speedMul;
    adminEls.speedMulVal.textContent = admin.speedMul.toFixed(2) + "x";
  }
  function openAdminPanel(){
    syncAdminPanel();
    adminEls.panel.classList.remove("hidden");
  }
  adminEls.gearBtn.addEventListener("click", openAdminPanel);
  adminEls.panelClose.addEventListener("click", ()=>adminEls.panel.classList.add("hidden"));

  adminEls.invincible.addEventListener("change", ()=>{
    admin.invincible = adminEls.invincible.checked;
    saveAdmin();
  });
  adminEls.scoreApply.addEventListener("click", ()=>{
    const n = Math.max(0, Math.round(Number(adminEls.scoreInput.value) || 0));
    score = n;
    els.score.textContent = score;
  });
  adminEls.gravity.addEventListener("input", ()=>{
    admin.gravity = Number(adminEls.gravity.value);
    adminEls.gravityVal.textContent = Math.round(admin.gravity);
    saveAdmin();
  });
  adminEls.flap.addEventListener("input", ()=>{
    admin.flapV = Number(adminEls.flap.value);
    adminEls.flapVal.textContent = Math.round(admin.flapV);
    saveAdmin();
  });
  adminEls.speedMul.addEventListener("input", ()=>{
    admin.speedMul = Number(adminEls.speedMul.value);
    adminEls.speedMulVal.textContent = admin.speedMul.toFixed(2) + "x";
    saveAdmin();
  });
  adminEls.resetPhysics.addEventListener("click", ()=>{
    admin.gravity = DEFAULT_GRAVITY;
    admin.flapV = DEFAULT_FLAP_V;
    admin.speedMul = 1;
    saveAdmin();
    syncAdminPanel();
  });

  if (admin.unlocked){
    adminEls.gearBtn.classList.remove("hidden");
  }

  // ---------- update ----------
  function update(dt){
    // decorative bricks drift regardless of game state (subtle idle motion)
    for (const b of bricks){
      b.x -= 12*b.mul*dt;
      if (b.x < -b.w){ b.x = LW + Math.random()*60; b.y = Math.random()*LH; }
    }

    if (state === "title"){
      titleT += dt;
      return;
    }
    if (state !== "playing") return;

    elapsed += dt;
    speed = difficultySpeed();
    spawnGap = difficultySpawnGap();

    spawnTimer += dt;
    if (spawnTimer >= spawnGap && (rings.length===0 || rings[rings.length-1].x < LW - 160)){
      spawnTimer = 0;
      spawnRing();
    }

    // ball physics (always falling, flap resets velocity upward)
    ball.vy += admin.gravity*dt;
    ball.y += ball.vy*dt;
    squash += (1-squash)*Math.min(1, dt*12);
    flapPulse *= Math.max(0, 1 - dt*4.5);
    tilt += (Math.max(-0.55, Math.min(0.7, ball.vy/900)) - tilt) * Math.min(1, dt*8);

    // boundaries
    if (ball.y - BALL_R < DEATH_TOP){
      ball.y = DEATH_TOP + BALL_R;
      ball.vy = Math.max(ball.vy, 0);
      if (!admin.invincible) gameOver();
    } else if (ball.y + BALL_R > DEATH_BOTTOM){
      ball.y = DEATH_BOTTOM - BALL_R;
      ball.vy = Math.min(ball.vy, 0);
      if (!admin.invincible) gameOver();
    }

    // rings: move, score on cross, miss (game over) if off-center
    for (const r of rings){
      const wasRight = r.x >= BALL_X;
      r.x -= speed*dt;
      const y = ringY(r);
      if (!r.passed && wasRight && r.x < BALL_X){
        r.passed = true;
        const off = Math.abs(ball.y - y);
        if (off > r.innerR - BALL_R*0.35){
          if (!admin.invincible){
            gameOver();
          }
        } else {
          const swish = off < r.innerR*0.32;
          if (swish){
            combo++;
            runSwishCount++;
            runBestCombo = Math.max(runBestCombo, combo);
            score += 2;
            sfxSwish();
            popup(r.x, y, "SWISH! +2", `hsl(${r.hue},90%,68%)`);
            burst(r.x, y, "255,230,120", 20);
          } else {
            combo = 0;
            score += 1;
            sfxScore();
            burst(r.x, y, `${r.hue},80%,60%`, 12);
          }
          els.score.textContent = score;
        }
      }
    }
    rings = rings.filter(r => r.x > -120);

    // particles / popups
    for (const pt of particles){
      pt.t += dt;
      pt.x += pt.vx*dt; pt.y += pt.vy*dt;
      pt.vy += 500*dt;
    }
    particles = particles.filter(pt => pt.t < pt.life);
    for (const pu of popups){ pu.t += dt; pu.y -= dt*40; }
    popups = popups.filter(pu => pu.t < pu.life);

    if (shake > 0) shake = Math.max(0, shake - dt*3);
    if (flashRed > 0) flashRed = Math.max(0, flashRed - dt*2.2);

    if (mode === "online" && onlineSession){
      onlineSendTimer += dt;
      if (onlineSendTimer >= 0.07){
        onlineSendTimer = 0;
        onlineSession.send("state", { y: ball.y, score, alive: true });
      }
    }
  }

  // ---------- draw ----------
  function drawBackground(){
    const g = ctx.createLinearGradient(0,0,0,LH);
    g.addColorStop(0, "#e7c99a");
    g.addColorStop(1, "#d8ae78");
    ctx.fillStyle = g;
    ctx.fillRect(0,0,LW,LH);

    for (const b of bricks){
      ctx.save();
      ctx.globalAlpha = b.a;
      ctx.fillStyle = "#c99a63";
      ctx.strokeStyle = "#8a6438";
      ctx.lineWidth = 3;
      roundRect(b.x, b.y, b.w, b.h, 7);
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  }
  function roundRect(x,y,w,h,r){
    ctx.beginPath();
    ctx.moveTo(x+r,y);
    ctx.arcTo(x+w,y,x+w,y+h,r);
    ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r);
    ctx.arcTo(x,y,x+w,y,r);
    ctx.closePath();
  }

  function drawRing(r){
    const y = ringY(r);
    const squashY = 0.58;
    const rimW = 23;
    const midR = r.innerR + rimW*0.5 + 3;

    ctx.save();
    ctx.translate(r.x, y);

    // moving rings slide along a diagonal rail (drawn behind, only while moving)
    if (r.moving){
      ctx.save();
      ctx.rotate(r.tilt*0.6 + Math.PI/2);
      ctx.strokeStyle = "rgba(90,80,70,.45)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, -(r.moveAmp + r.innerR + 40));
      ctx.lineTo(0, r.moveAmp + r.innerR + 40);
      ctx.stroke();
      ctx.restore();
    }

    ctx.rotate(r.tilt);

    // flame licks around the rim
    for (let i=0;i<6;i++){
      const ang = (i/6)*Math.PI*2 + elapsed*1.4 + r.flameSeed;
      const flick = 1 + Math.sin(elapsed*9 + r.flameSeed + i)*0.35;
      const fx = Math.cos(ang)*midR;
      const fy = Math.sin(ang)*midR*squashY;
      ctx.save();
      ctx.translate(fx, fy);
      ctx.rotate(ang);
      const fg = ctx.createRadialGradient(0,0,0, 0,0, 13*flick);
      fg.addColorStop(0, "rgba(255,240,150,.95)");
      fg.addColorStop(0.5, "rgba(255,150,40,.7)");
      fg.addColorStop(1, "rgba(255,80,20,0)");
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.ellipse(0,0, 13*flick, 8*flick, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }

    // soft glow to lift the ring off the background (depth cue)
    ctx.save();
    ctx.scale(1, squashY);
    ctx.shadowColor = `hsla(${r.hue},95%,60%,.55)`;
    ctx.shadowBlur = 22;
    ctx.beginPath();
    ctx.arc(0,0, midR, 0, Math.PI*2);
    ctx.lineWidth = rimW + 6;
    ctx.strokeStyle = "rgba(50,15,8,.6)";
    ctx.stroke();
    ctx.restore();

    ctx.scale(1, squashY);

    // outer dark toon outline (no glow, crisp edge)
    ctx.beginPath();
    ctx.arc(0,0, midR, 0, Math.PI*2);
    ctx.lineWidth = rimW + 6;
    ctx.strokeStyle = "rgba(50,15,8,.6)";
    ctx.stroke();

    // colored tube gradient: bright highlight (near/top) -> saturated -> deep shadow (far/bottom)
    const rg = ctx.createLinearGradient(0,-midR,0,midR);
    rg.addColorStop(0,   `hsl(${r.hue},100%,88%)`);
    rg.addColorStop(0.22,`hsl(${r.hue},95%,66%)`);
    rg.addColorStop(0.55,`hsl(${r.hue},88%,44%)`);
    rg.addColorStop(0.8, `hsl(${r.hue},80%,26%)`);
    rg.addColorStop(1,   `hsl(${r.hue},70%,14%)`);
    ctx.beginPath();
    ctx.arc(0,0, midR, 0, Math.PI*2);
    ctx.lineWidth = rimW;
    ctx.strokeStyle = rg;
    ctx.stroke();

    // dark inner-edge shadow where the tube curves into the hole
    ctx.beginPath();
    ctx.arc(0,0, r.innerR+1, 0, Math.PI*2);
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(30,10,5,.4)";
    ctx.stroke();

    // bright highlight ring on the inner edge (top rim catching the light)
    ctx.beginPath();
    ctx.arc(0,0, r.innerR+4, 0, Math.PI*2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = `hsla(${r.hue},100%,90%,.85)`;
    ctx.stroke();

    // glossy specular highlights (sell the round tube surface)
    ctx.save();
    ctx.scale(1, 1/squashY); // undo squash so the highlight blobs stay round-ish
    for (const side of [-1, 1]){
      const ang = side * 0.95; // near the upper sides of the ring
      const hx = Math.cos(ang) * midR;
      const hy = Math.sin(ang) * midR * squashY;
      const hg = ctx.createRadialGradient(hx,hy,0, hx,hy, rimW*0.55);
      hg.addColorStop(0, "rgba(255,255,255,.85)");
      hg.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.ellipse(hx, hy, rimW*0.5, rimW*0.22, ang, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.restore();

    ctx.restore();
  }

  function wingPath(dir){
    // dir: -1 left wing, +1 right wing
    ctx.beginPath();
    ctx.moveTo(dir*BALL_R*0.3, -BALL_R*0.1);
    ctx.quadraticCurveTo(dir*BALL_R*1.9, -BALL_R*1.5, dir*BALL_R*2.5, -BALL_R*0.2);
    ctx.quadraticCurveTo(dir*BALL_R*1.6, BALL_R*0.15, dir*BALL_R*0.35, BALL_R*0.35);
    ctx.closePath();
  }
  function drawWings(flapAmt){
    const spread = 0.15 + flapAmt*0.55;
    ctx.save();
    ctx.rotate(-spread);
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#2a2a2a";
    ctx.lineWidth = 2.5;
    wingPath(-1);
    ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.rotate(spread);
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#2a2a2a";
    ctx.lineWidth = 2.5;
    wingPath(1);
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function drawBallFace(skin){
    ctx.beginPath();
    ctx.arc(0,0,BALL_R,0,Math.PI*2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#241a10";

    if (skin === "soccer"){
      ctx.fillStyle = "#f4f4f4"; ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#222";
      for (let i=0;i<5;i++){
        const a = -Math.PI/2 + i*(Math.PI*2/5);
        ctx.beginPath();
        ctx.arc(Math.cos(a)*BALL_R*0.5, Math.sin(a)*BALL_R*0.5, BALL_R*0.22, 0, Math.PI*2);
        ctx.fill();
      }
    } else if (skin === "eightball"){
      ctx.fillStyle = "#1c1c1c"; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0,0,BALL_R*0.5,0,Math.PI*2);
      ctx.fillStyle = "#fff"; ctx.fill();
      ctx.fillStyle = "#1c1c1c"; ctx.font = `bold ${Math.round(BALL_R*0.55)}px system-ui`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("8", 0, 1);
    } else if (skin === "globe"){
      const g = ctx.createLinearGradient(-BALL_R,0,BALL_R,0);
      g.addColorStop(0,"#3fa9e0"); g.addColorStop(1,"#2b7fb0");
      ctx.fillStyle = g; ctx.fill(); ctx.stroke();
      ctx.fillStyle = "rgba(90,200,110,.9)";
      ctx.beginPath(); ctx.ellipse(-BALL_R*0.3,-BALL_R*0.2,BALL_R*0.4,BALL_R*0.28,0.3,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(BALL_R*0.35,BALL_R*0.35,BALL_R*0.3,BALL_R*0.2,-0.4,0,Math.PI*2); ctx.fill();
    } else if (skin === "alien"){
      ctx.fillStyle = "#7a4dd6"; ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#000";
      ctx.beginPath(); ctx.ellipse(-BALL_R*0.32,-BALL_R*0.1,BALL_R*0.22,BALL_R*0.3,0,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(BALL_R*0.32,-BALL_R*0.1,BALL_R*0.22,BALL_R*0.3,0,0,Math.PI*2); ctx.fill();
    } else if (skin === "disco"){
      const grd = ctx.createConicGradient ? ctx.createConicGradient(titleT+elapsed, 0, 0) : null;
      if (grd){
        grd.addColorStop(0, "#ff4d6a"); grd.addColorStop(0.17, "#ffb84d");
        grd.addColorStop(0.34, "#fff64d"); grd.addColorStop(0.5, "#4dff8a");
        grd.addColorStop(0.67, "#4dd4ff"); grd.addColorStop(0.84, "#a34dff");
        grd.addColorStop(1, "#ff4d6a");
        ctx.fillStyle = grd;
      } else ctx.fillStyle = "#ff9ad6";
      ctx.fill(); ctx.stroke();
    } else if (skin === "beach"){
      ctx.fillStyle = "#fff"; ctx.fill(); ctx.stroke();
      const cols = ["#ff5a5a","#ffcf4d","#4dd4ff"];
      for (let i=0;i<3;i++){
        ctx.fillStyle = cols[i];
        ctx.beginPath();
        ctx.moveTo(0,0);
        ctx.arc(0,0,BALL_R, -Math.PI/2 + i*(Math.PI*2/3), -Math.PI/2 + i*(Math.PI*2/3) + Math.PI*2/6);
        ctx.closePath(); ctx.fill();
      }
      ctx.beginPath(); ctx.arc(0,0,BALL_R,0,Math.PI*2); ctx.stroke();
    } else {
      // default: basketball
      const g = ctx.createRadialGradient(-BALL_R*0.3,-BALL_R*0.3,3,0,0,BALL_R*1.2);
      g.addColorStop(0, "#ffb15c"); g.addColorStop(0.5, "#f0791f"); g.addColorStop(1, "#c85a10");
      ctx.fillStyle = g; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-BALL_R,0); ctx.lineTo(BALL_R,0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0,-BALL_R); ctx.lineTo(0,BALL_R); ctx.stroke();
      ctx.beginPath(); ctx.arc(0,0,BALL_R-2,0.35,Math.PI-0.35); ctx.stroke();
      ctx.beginPath(); ctx.arc(0,0,BALL_R-2,Math.PI+0.35,Math.PI*2-0.35); ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(-BALL_R*0.35,-BALL_R*0.35,BALL_R*0.24,0,Math.PI*2);
    ctx.fillStyle = "rgba(255,255,255,.55)";
    ctx.fill();
  }

  function drawBall(){
    const y = state === "title" ? LH/2 + Math.sin(titleT*2.4)*16 : ball.y;
    const rotTilt = state === "title" ? 0 : tilt;
    const flapAmt = state === "title" ? (Math.sin(titleT*2.4)+1)/2 : flapPulse;
    ctx.save();
    ctx.translate(BALL_X, y);
    ctx.scale(1/Math.sqrt(squash), squash);
    ctx.rotate(rotTilt);
    drawWings(flapAmt);
    drawBallFace(PROFILE.getSkin());
    ctx.restore();
  }

  function drawPeerBall(){
    if (mode !== "online" || !peerState.alive) return;
    ctx.save();
    ctx.globalAlpha = 0.42;
    ctx.translate(BALL_X + 58, peerState.y);
    drawBallFace(PROFILE.getSkin());
    ctx.restore();
  }

  function drawParticles(){
    for (const pt of particles){
      const a = 1 - pt.t/pt.life;
      ctx.fillStyle = `rgba(${pt.color},${a})`;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI*2);
      ctx.fill();
    }
  }
  function drawPopups(){
    for (const pu of popups){
      const a = 1 - pu.t/pu.life;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = pu.color;
      ctx.font = "bold 26px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.strokeStyle = "rgba(0,0,0,.4)";
      ctx.lineWidth = 4;
      ctx.strokeText(pu.text, pu.x, pu.y);
      ctx.fillText(pu.text, pu.x, pu.y);
      ctx.restore();
    }
  }

  function render(){
    ctx.save();
    ctx.setTransform(scaleX,0,0,scaleY, offX, offY);
    ctx.clearRect(-offX/scaleX, -offY/scaleY, canvas.width/scaleX+2, canvas.height/scaleY+2);

    let sx=0, sy=0;
    if (shake > 0){
      sx = (Math.random()-0.5)*10*shake;
      sy = (Math.random()-0.5)*10*shake;
    }
    ctx.translate(sx, sy);

    drawBackground();
    for (const r of rings) drawRing(r);
    drawParticles();
    drawPopups();
    drawPeerBall();
    if (ball) drawBall();

    if (flashRed > 0){
      ctx.fillStyle = `rgba(255,40,40,${flashRed*0.35})`;
      ctx.fillRect(-50,-50,LW+100,LH+100);
    }
    ctx.restore();
  }

  function loop(ts){
    if (!lastT) lastT = ts;
    let dt = (ts - lastT)/1000;
    lastT = ts;
    dt = Math.min(dt, 0.033);
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  ball = { y: LH/2, vy: 0 };
  requestAnimationFrame(loop);
})();
