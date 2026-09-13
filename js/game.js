// RING JUMP DELUXE - game logic (Flappy Bird-style: tap to flap, hoops instead of pipes)
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
  const GROUND_H = 90;              // decorative ground strip height (death floor)
  const DEATH_TOP = 2;              // touching the very top = game over
  const DEATH_BOTTOM = LH - GROUND_H; // touching the ground = game over
  const BALL_X = 140;
  const BALL_R = 20;
  const GRAVITY = 1500;             // px/s^2
  const FLAP_V = -430;              // velocity set on every flap (tap)

  const BEST_KEY = "ringjump_best_v2";

  let state = "title"; // title | playing | gameover
  let ball = null;
  let pillars = [];
  let particles = [];
  let popups = [];
  let score = 0;
  let combo = 0;
  let best = Number(localStorage.getItem(BEST_KEY) || 0);
  let speed = 240;
  let spawnTimer = 0;
  let spawnGap = 1.7;
  let shake = 0;
  let flashRed = 0;
  let bgOffset = 0;
  let lastT = 0;
  let squash = 1;
  let groundScroll = 0;
  let titleT = 0;

  const els = {
    hud: document.getElementById("hud"),
    score: document.getElementById("score"),
    bestBig: document.getElementById("bestBig"),
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
  };
  els.bestBig.textContent = best;

  function ranks(s){
    if (s >= 60) return "輪くぐり神";
    if (s >= 40) return "リングマスター";
    if (s >= 25) return "ベテラン";
    if (s >= 15) return "できるボール";
    if (s >= 8) return "見習いボール";
    if (s >= 3) return "ころころビギナー";
    return "まだまだこれから";
  }

  function resetGame(){
    ball = { y: LH/2, vy: 0, rot: 0 };
    pillars = [];
    particles = [];
    popups = [];
    score = 0;
    combo = 0;
    speed = 240;
    spawnTimer = 0;
    spawnGap = 1.7;
    shake = 0; flashRed = 0;
    squash = 1;
    groundScroll = 0;
    els.score.textContent = "0";
  }

  function startGame(){
    ensureAudio();
    resetGame();
    state = "playing";
    els.titleScreen.classList.add("hidden");
    els.resultScreen.classList.add("hidden");
    els.hud.classList.remove("hidden");
  }

  function difficultyGapHalf(){
    const t = Math.min(score / 28, 1);
    return 105 - t * 43; // 105 -> 62
  }
  function difficultySpeed(){
    return Math.min(240 + score * 7, 520);
  }
  function difficultySpawnGap(){
    return Math.max(1.7 - score * 0.02, 1.05);
  }

  function spawnPillar(){
    const gapHalf = difficultyGapHalf();
    const margin = 60;
    const minC = DEATH_TOP + gapHalf + margin;
    const maxC = DEATH_BOTTOM - gapHalf - margin;
    const gapY = minC + Math.random() * Math.max(10, maxC - minC);
    const hue = [16, 42, 200, 140, 320][pillars.length % 5];
    pillars.push({
      x: LW + 60,
      w: 70,
      gapY, gapHalf,
      passed: false,
      hue,
    });
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
    ball.vy = FLAP_V;
    squash = 1.28;
    sfxFlap();
    burst(BALL_X-10, ball.y+8, "255,255,255", 4);
  }

  function gameOver(){
    state = "gameover";
    shake = 1;
    flashRed = 1;
    sfxHit();
    els.hud.classList.add("hidden");
    const isNew = score > best;
    if (isNew){ best = score; localStorage.setItem(BEST_KEY, String(best)); }
    els.bestBig.textContent = best;
    setTimeout(()=>{
      els.finalScore.textContent = score;
      els.finalBest.textContent = best;
      els.resultRank.textContent = ranks(score);
      els.newBestTag.classList.toggle("hidden", !isNew);
      els.resultScreen.classList.remove("hidden");
    }, 550);
  }

  // ---------- input ----------
  function onDown(e){
    if (e.cancelable) e.preventDefault();
    if (state === "title"){ startGame(); return; }
    if (state === "playing"){ flap(); return; }
  }
  canvas.addEventListener("pointerdown", onDown, {passive:false});
  window.addEventListener("keydown", (e)=>{
    if (e.code === "Space" || e.code === "ArrowUp"){
      if (e.repeat) return;
      if (e.cancelable) e.preventDefault();
      if (state === "title") startGame();
      else if (state === "playing") flap();
    }
  });
  els.startBtn.addEventListener("click", startGame);
  els.retryBtn.addEventListener("click", startGame);
  els.titleBtn.addEventListener("click", ()=>{
    state = "title";
    els.resultScreen.classList.add("hidden");
    els.titleScreen.classList.remove("hidden");
  });

  // ---------- update ----------
  function update(dt){
    if (state === "title"){
      titleT += dt;
      return;
    }
    if (state !== "playing") return;

    speed = difficultySpeed();
    spawnGap = difficultySpawnGap();

    spawnTimer += dt;
    if (spawnTimer >= spawnGap && (pillars.length===0 || pillars[pillars.length-1].x < LW - 150)){
      spawnTimer = 0;
      spawnPillar();
    }

    // ball physics (always falling, flap resets velocity upward)
    ball.vy += GRAVITY*dt;
    ball.y += ball.vy*dt;
    ball.rot += ball.vy*dt*0.003;
    squash += (1-squash)*Math.min(1, dt*12);

    // boundaries
    if (ball.y - BALL_R < DEATH_TOP){
      ball.y = DEATH_TOP + BALL_R;
      gameOver();
    } else if (ball.y + BALL_R > DEATH_BOTTOM){
      ball.y = DEATH_BOTTOM - BALL_R;
      gameOver();
    }

    // pillars
    for (const p of pillars){
      p.x -= speed*dt;
      if (!p.passed && p.x + p.w/2 < BALL_X){
        p.passed = true;
        const off = Math.abs(ball.y - p.gapY);
        const swish = off < p.gapHalf*0.32;
        if (swish){
          combo++;
          score += 2;
          sfxSwish();
          popup(p.x, p.gapY, "SWISH! +2", `hsl(${p.hue},90%,65%)`);
          burst(p.x, p.gapY, "255,230,120", 20);
        } else {
          combo = 0;
          score += 1;
          sfxScore();
          burst(p.x, p.gapY, `${p.hue},80%,60%`, 12);
        }
        els.score.textContent = score;
      }
    }
    pillars = pillars.filter(p => p.x > -100);

    // collision
    if (state === "playing"){
      for (const p of pillars){
        const left = p.x - p.w/2, right = p.x + p.w/2;
        if (BALL_X + BALL_R > left && BALL_X - BALL_R < right){
          const topBlocked = ball.y - BALL_R < p.gapY - p.gapHalf;
          const botBlocked = ball.y + BALL_R > p.gapY + p.gapHalf;
          if (topBlocked || botBlocked){
            gameOver();
            break;
          }
        }
      }
    }

    // particles / popups
    for (const pt of particles){
      pt.t += dt;
      pt.x += pt.vx*dt; pt.y += pt.vy*dt;
      pt.vy += 500*dt;
    }
    particles = particles.filter(pt => pt.t < pt.life);
    for (const pu of popups){ pu.t += dt; pu.y -= dt*40; }
    popups = popups.filter(pu => pu.t < pu.life);

    bgOffset -= speed*0.25*dt;
    groundScroll -= speed*dt;

    if (shake > 0) shake = Math.max(0, shake - dt*3);
    if (flashRed > 0) flashRed = Math.max(0, flashRed - dt*2.2);
  }

  // ---------- draw ----------
  function drawBackground(){
    const g = ctx.createLinearGradient(0,0,0,DEATH_BOTTOM);
    g.addColorStop(0, "#8ad9ff");
    g.addColorStop(1, "#e6f9ff");
    ctx.fillStyle = g;
    ctx.fillRect(0,0,LW,DEATH_BOTTOM);

    ctx.fillStyle = "rgba(255,255,255,.85)";
    for (let i=0;i<5;i++){
      const cx = ((i*220 + bgOffset*0.6) % (LW+200)) - 100;
      const cy = 70 + (i%3)*55;
      cloud(cx, cy, 34);
    }

    const gg = ctx.createLinearGradient(0,DEATH_BOTTOM,0,LH);
    gg.addColorStop(0, "#7ac95e");
    gg.addColorStop(1, "#4d8f3b");
    ctx.fillStyle = gg;
    ctx.fillRect(0, DEATH_BOTTOM, LW, LH-DEATH_BOTTOM);
    ctx.strokeStyle = "rgba(255,255,255,.35)";
    ctx.lineWidth = 4;
    ctx.setLineDash([26,22]);
    ctx.lineDashOffset = groundScroll;
    ctx.beginPath();
    ctx.moveTo(0, DEATH_BOTTOM+14);
    ctx.lineTo(LW, DEATH_BOTTOM+14);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  function cloud(x,y,s){
    ctx.beginPath();
    ctx.arc(x, y, s*0.6, 0, Math.PI*2);
    ctx.arc(x+s*0.6, y+6, s*0.5, 0, Math.PI*2);
    ctx.arc(x-s*0.6, y+8, s*0.45, 0, Math.PI*2);
    ctx.fill();
  }

  function drawPillar(p){
    const left = p.x - p.w/2, right = p.x + p.w/2;
    const topH = p.gapY - p.gapHalf;
    const botY = p.gapY + p.gapHalf;
    const col1 = `hsl(${p.hue},70%,45%)`;
    const col2 = `hsl(${p.hue},70%,32%)`;

    let gt = ctx.createLinearGradient(left,0,right,0);
    gt.addColorStop(0,col2); gt.addColorStop(0.5,col1); gt.addColorStop(1,col2);
    ctx.fillStyle = gt;
    ctx.fillRect(left, 0, p.w, Math.max(0,topH));
    ctx.fillRect(left, botY, p.w, Math.max(0, DEATH_BOTTOM - botY));

    const rimR = p.gapHalf + 15;
    ctx.save();
    ctx.beginPath();
    ctx.arc(p.x, p.gapY, rimR, 0, Math.PI*2);
    ctx.lineWidth = 15;
    ctx.strokeStyle = `hsl(${p.hue},85%,60%)`;
    ctx.stroke();
    ctx.lineWidth = 5;
    ctx.strokeStyle = `hsl(${p.hue},90%,80%)`;
    ctx.beginPath();
    ctx.arc(p.x, p.gapY, rimR-8, 0, Math.PI*2);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.arc(p.x, p.gapY, p.gapHalf, 0, Math.PI*2);
    ctx.clip();
    drawBackground();
    ctx.restore();
  }

  function drawBall(){
    const y = state === "title" ? LH/2 + Math.sin(titleT*2.4)*16 : ball.y;
    const rot = state === "title" ? titleT*1.2 : ball.rot;
    ctx.save();
    ctx.translate(BALL_X, y);
    ctx.scale(1/Math.sqrt(squash), squash);
    ctx.rotate(rot);
    const grd = ctx.createRadialGradient(-BALL_R*0.35,-BALL_R*0.35,3, 0,0, BALL_R*1.3);
    grd.addColorStop(0, "#ffd08a");
    grd.addColorStop(0.35, "#ff9a4d");
    grd.addColorStop(1, "#e05a1f");
    ctx.beginPath();
    ctx.arc(0,0,BALL_R,0,Math.PI*2);
    ctx.fillStyle = grd;
    ctx.fill();
    ctx.strokeStyle = "rgba(180,70,20,.6)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0,0,BALL_R-3,0.2,Math.PI-0.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0,0,BALL_R-3,Math.PI+0.2,Math.PI*2-0.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-BALL_R+3,0); ctx.lineTo(BALL_R-3,0);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-BALL_R*0.35,-BALL_R*0.35,BALL_R*0.28,0,Math.PI*2);
    ctx.fillStyle = "rgba(255,255,255,.7)";
    ctx.fill();
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
    for (const p of pillars) drawPillar(p);
    drawParticles();
    drawPopups();
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

  ball = { y: LH/2, vy: 0, rot: 0 };
  requestAnimationFrame(loop);
})();
