(() => {
  const canvas = document.querySelector('#gameCanvas');
  const ctx = canvas.getContext('2d');
  const frame = document.querySelector('#gameFrame');
  const $ = (s) => document.querySelector(s);
  const startOverlay = $('#startOverlay'), pauseOverlay = $('#pauseOverlay'), endOverlay = $('#endOverlay');
  const hud = $('#hud'), scoreEl = $('#scoreDisplay'), timeEl = $('#timeDisplay'), bestEl = $('#bestDisplay'), sideBest = $('#sideBest');
  const bestKey = 'fruitFrenzyBest';
  let best = Number(localStorage.getItem(bestKey) || 0);
  let width = 0, height = 0, dpr = 1, last = 0, elapsed = 0, score = 0, lives = 3;
  let state = 'menu', spawnClock = 0, pointerDown = false, previousPointer = null, shake = 0, toastTimer = 0;
  let fruits = [], particles = [], trails = [], ambient = [];
  let soundOn = true, audioContext;
  bestEl.textContent = sideBest.textContent = String(best).padStart(3, '0');

  const types = [
    { name: 'orange', color: '#ff9f35', light: '#ffd36e', dark: '#e65d25', points: 1 },
    { name: 'watermelon', color: '#e84856', light: '#ff8b76', dark: '#a81f4d', points: 1 },
    { name: 'lime', color: '#a8d84b', light: '#e2f66d', dark: '#4c9f49', points: 1 },
    { name: 'blueberry', color: '#7868db', light: '#b2a1ff', dark: '#3e3a9d', points: 1 },
    { name: 'peach', color: '#ff8a75', light: '#ffd087', dark: '#dc4e62', points: 1 },
    { name: 'bomb', color: '#272731', light: '#656570', dark: '#111119', points: 0 }
  ];
  const rand = (a, b) => a + Math.random() * (b - a);

  function resize() {
    const rect = frame.getBoundingClientRect();
    width = rect.width; height = rect.height; dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ambient = Array.from({ length: Math.floor(width * height / 8500) }, () => ({ x: rand(0,width), y: rand(0,height), r: rand(.5,1.7), phase: rand(0,7) }));
  }
  window.addEventListener('resize', resize); resize();

  function tone(freq, duration, type = 'sine', volume = .035) {
    if (!soundOn) return;
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === 'suspended') audioContext.resume();
      const osc = audioContext.createOscillator(), gain = audioContext.createGain();
      osc.type = type; osc.frequency.setValueAtTime(freq, audioContext.currentTime);
      gain.gain.setValueAtTime(volume, audioContext.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + duration);
      osc.connect(gain); gain.connect(audioContext.destination); osc.start(); osc.stop(audioContext.currentTime + duration);
    } catch (_) {}
  }

  function showToast(text) {
    const el = $('#toast'); el.textContent = text; el.classList.add('show'); toastTimer = .9;
  }
  function updateScore() {
    scoreEl.textContent = String(score).padStart(3, '0');
    if (score > best) { best = score; localStorage.setItem(bestKey, best); bestEl.textContent = sideBest.textContent = String(best).padStart(3, '0'); }
  }
  function reset() {
    score = 0; elapsed = 0; lives = 3; spawnClock = .65; fruits = []; particles = []; trails = []; shake = 0;
    scoreEl.textContent = '000'; timeEl.textContent = '60';
    $('#livesDisplay').querySelectorAll('i').forEach(x => x.classList.remove('lost'));
  }
  function start() {
    reset(); state = 'playing'; startOverlay.classList.add('hidden'); pauseOverlay.classList.add('hidden'); endOverlay.classList.add('hidden'); hud.classList.add('active'); hud.setAttribute('aria-hidden','false');
    last = performance.now();
  }
  function pause() { if (state !== 'playing') return; state = 'paused'; pointerDown = false; pauseOverlay.classList.remove('hidden'); }
  function resume() { if (state !== 'paused') return; state = 'playing'; pauseOverlay.classList.add('hidden'); last = performance.now(); }
  function finish(reason = 'time') {
    if (state === 'ended') return;
    state = 'ended'; hud.classList.remove('active'); endOverlay.classList.remove('hidden');
    $('#finalScore').textContent = String(score).padStart(3, '0');
    $('#endEyebrow').textContent = reason === 'bomb' ? 'BOOM — THAT WAS CLOSE' : 'NICE SLICING';
    $('#endTitle').innerHTML = reason === 'bomb' ? 'Oops, that\'s<br><span>a bomb.</span>' : 'That\'s<br><span>the juice.</span>';
    $('#endMessage').textContent = score >= best && score > 0 ? 'A new personal best. You absolute legend.' : 'A juicy run. Ready for another?';
    tone(reason === 'bomb' ? 100 : 520, .24, reason === 'bomb' ? 'sawtooth' : 'sine', .045);
  }
  function loseLife() {
    lives--;
    const dots = $('#livesDisplay').querySelectorAll('i');
    if (dots[lives]) dots[lives].classList.add('lost');
    shake = 8; tone(150, .14, 'triangle', .025);
    if (lives <= 0) finish('miss');
  }
  function spawnWave() {
    const count = Math.random() < .24 ? 3 : (Math.random() < .58 ? 2 : 1);
    const center = rand(width * .28, width * .72);
    const bombChance = elapsed > 9 ? .13 : .07;
    const wave = { missed: false };
    for (let i=0; i<count; i++) {
      const bomb = Math.random() < bombChance && i === count - 1;
      const type = bomb ? types[5] : types[Math.floor(Math.random() * (types.length - 1))];
      const radius = rand(22, 30) * Math.min(1.12, width / 400);
      fruits.push({ x: center + (i - (count - 1) / 2) * rand(49,62), y: height + radius + rand(0,30), vx: (i - (count - 1)/2) * rand(45,95) + rand(-30,30), vy: -rand(555,690) * Math.min(1.08,height/430), gravity: rand(840,970), radius, type, spin: rand(-3,3), rotation: rand(-1,1), sliced: false, hit: false, age: 0, wave, halves: [] });
    }
    spawnClock = rand(1.25,1.65) * Math.max(.58, 1 - elapsed / 115);
  }
  function pointFromEvent(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX-r.left, y: e.clientY-r.top }; }
  function pointerStart(e) { if(state !== 'playing') return; e.preventDefault(); pointerDown=true; previousPointer=pointFromEvent(e); canvas.setPointerCapture?.(e.pointerId); }
  function pointerMove(e) {
    if (!pointerDown || state !== 'playing') return;
    const p = pointFromEvent(e); trails.push({ x1: previousPointer.x, y1: previousPointer.y, x2: p.x, y2: p.y, life: .22, max: .22 });
    const cut = [];
    for (const f of fruits) {
      if (f.sliced || f.type.name === 'bomb') continue;
      if (segmentDistance(f.x,f.y,previousPointer.x,previousPointer.y,p.x,p.y) < f.radius * .9) { f.sliced=true; cut.push(f); }
    }
    if (cut.length) {
      score += cut.reduce((n,f)=>n+f.type.points,0) * (cut.length >= 3 ? 2 : 1);
      updateScore(); tone(440 + Math.min(cut.length,4)*90, .09, 'sine', .035);
      if(cut.length >= 2) showToast(cut.length >= 3 ? 'MEGA COMBO!  ×2' : 'DOUBLE SLICE!');
      cut.forEach(f=>sliceFruit(f, previousPointer,p));
    }
    for (const f of fruits) if (f.type.name==='bomb' && segmentDistance(f.x,f.y,previousPointer.x,previousPointer.y,p.x,p.y)<f.radius*.85) { f.hit=true; finish('bomb'); break; }
    previousPointer=p;
  }
  function pointerEnd() { pointerDown=false; previousPointer=null; }
  function segmentDistance(px,py,x1,y1,x2,y2) { const dx=x2-x1,dy=y2-y1,l=dx*dx+dy*dy; if(!l)return Math.hypot(px-x1,py-y1); const t=Math.max(0,Math.min(1,((px-x1)*dx+(py-y1)*dy)/l)); return Math.hypot(px-(x1+t*dx),py-(y1+t*dy)); }
  canvas.addEventListener('pointerdown',pointerStart); canvas.addEventListener('pointermove',pointerMove); canvas.addEventListener('pointerup',pointerEnd); canvas.addEventListener('pointercancel',pointerEnd); canvas.addEventListener('lostpointercapture',pointerEnd);

  function sliceFruit(f, a, b) {
    const angle=Math.atan2(b.y-a.y,b.x-a.x); f.halves=[{x:f.x,y:f.y,vx:f.vx-Math.sin(angle)*120-45,vy:f.vy-140,rot:f.rotation,spin:-2},{x:f.x,y:f.y,vx:f.vx+Math.sin(angle)*120+45,vy:f.vy-140,rot:f.rotation,spin:2}];
    for(let i=0;i<14;i++){const ang=rand(0,Math.PI*2),speed=rand(45,210);particles.push({x:f.x,y:f.y,vx:Math.cos(ang)*speed,vy:Math.sin(ang)*speed,life:rand(.35,.8),max:.8,r:rand(2,5),color:i%3===0?'#fff0c1':f.type.color});}
  }
  function update(dt) {
    if(state==='playing') {
      elapsed+=dt; timeEl.textContent=String(Math.max(0,Math.ceil(60-elapsed))).padStart(2,'0');
      if(elapsed>=60){finish('time');return}
      spawnClock-=dt; if(spawnClock<=0)spawnWave();
      for(const f of fruits){f.age+=dt;f.x+=f.vx*dt;f.y+=f.vy*dt;f.vy+=f.gravity*dt;f.rotation+=f.spin*dt;
        if(f.sliced&&f.halves.length){for(const h of f.halves){h.x+=h.vx*dt;h.y+=h.vy*dt;h.vy+=f.gravity*dt;h.rot+=h.spin*dt;}}
        if(!f.sliced&&f.y-f.radius>height&&f.type.name!=='bomb'){f.sliced=true;if(!f.wave.missed){f.wave.missed=true;loseLife();}}
      }
      fruits=fruits.filter(f=>f.y<height+100||f.sliced&&f.halves.some(h=>h.y<height+90));
    }
    particles=particles.filter(p=>p.life>0); for(const p of particles){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=320*dt;}
    trails=trails.filter(t=>t.life>0);for(const t of trails)t.life-=dt;
    shake=Math.max(0,shake-dt*28);if(toastTimer>0){toastTimer-=dt;if(toastTimer<=0)$('#toast').classList.remove('show');}
  }

  function roundedFruit(f) {
    const r=f.radius, t=f.type; ctx.save();ctx.translate(f.x,f.y);ctx.rotate(f.rotation);
    // Soft shadow gives the fruit its little pop.
    ctx.shadowColor='rgba(0,0,0,.32)';ctx.shadowBlur=15;ctx.shadowOffsetY=7;
    const g=ctx.createRadialGradient(-r*.34,-r*.42,r*.04,0,0,r*1.1);g.addColorStop(0,t.light);g.addColorStop(.58,t.color);g.addColorStop(1,t.dark);
    ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(0,0,r*.91,r,0,0,Math.PI*2);ctx.fill();ctx.shadowColor='transparent';ctx.shadowBlur=0;ctx.shadowOffsetY=0;
    if(t.name==='watermelon'){
      ctx.strokeStyle='rgba(112,226,102,.72)';ctx.lineWidth=2.3;for(let i=-1;i<=1;i++){ctx.beginPath();ctx.moveTo(i*r*.35,-r*.72);ctx.quadraticCurveTo(i*r*.35+7,0,i*r*.3,r*.75);ctx.stroke();}
    }
    if(t.name==='orange'){ctx.fillStyle='rgba(255,235,167,.7)';ctx.beginPath();ctx.arc(-r*.12,-r*.13,r*.11,0,7);ctx.fill();ctx.strokeStyle=t.dark;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,-r*.88);ctx.lineTo(2,-r*1.05);ctx.stroke();}
    if(t.name==='lime'){ctx.strokeStyle='rgba(238,255,177,.6)';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(-r*.3,-r*.64);ctx.quadraticCurveTo(-r*.65,0,-r*.18,r*.66);ctx.stroke();}
    if(t.name==='peach'){ctx.strokeStyle='rgba(255,214,164,.8)';ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(0,-r*.77);ctx.bezierCurveTo(-r*.25,-r*.2,r*.18,r*.2,0,r*.78);ctx.stroke();}
    if(t.name==='blueberry'){ctx.fillStyle='rgba(221,210,255,.55)';ctx.beginPath();ctx.arc(-r*.16,-r*.2,r*.08,0,7);ctx.fill();ctx.beginPath();ctx.arc(r*.2,r*.2,r*.055,0,7);ctx.fill();ctx.fillStyle=t.dark;ctx.beginPath();for(let j=0;j<5;j++){const a=j*Math.PI*2/5;ctx.lineTo(Math.cos(a)*5,Math.sin(a)*5-r*.88);}ctx.closePath();ctx.fill();}
    ctx.restore();
  }
  function drawBomb(f) {
    ctx.save();ctx.translate(f.x,f.y);ctx.rotate(f.rotation);
    const g=ctx.createRadialGradient(-f.radius*.4,-f.radius*.4,2,0,0,f.radius);g.addColorStop(0,'#61616c');g.addColorStop(.45,'#2d2e39');g.addColorStop(1,'#11121a');ctx.fillStyle=g;ctx.shadowColor='rgba(0,0,0,.5)';ctx.shadowBlur=12;ctx.beginPath();ctx.arc(0,0,f.radius*.87,0,7);ctx.fill();ctx.shadowBlur=0;
    ctx.strokeStyle='#b7a079';ctx.lineWidth=4;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(f.radius*.48,-f.radius*.64);ctx.quadraticCurveTo(f.radius*.9,-f.radius*1.05,f.radius*.67,-f.radius*1.2);ctx.stroke();
    ctx.fillStyle='#ffcb58';ctx.shadowColor='#ff7044';ctx.shadowBlur=8;ctx.beginPath();ctx.arc(f.radius*.68,-f.radius*1.21,3,0,7);ctx.fill();ctx.restore();
  }
  function drawHalf(f,h) {
    const r=f.radius;ctx.save();ctx.translate(h.x,h.y);ctx.rotate(h.rot);const g=ctx.createRadialGradient(-r*.3,-r*.3,1,0,0,r);g.addColorStop(0,f.type.light);g.addColorStop(.45,f.type.color);g.addColorStop(1,f.type.dark);ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,r*.88,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff0c1';ctx.beginPath();ctx.ellipse(0,0,r*.58,r*.66,0,0,Math.PI*2);ctx.fill();ctx.fillStyle=f.type.name==='watermelon'?'#392c35':'#ffb25d';for(let i=0;i<5;i++){const a=i*Math.PI*2/5;ctx.beginPath();ctx.ellipse(Math.cos(a)*r*.23,Math.sin(a)*r*.24,1.5,2,a,0,7);ctx.fill();}ctx.restore();
  }
  function drawBackground(now) {
    const grad=ctx.createLinearGradient(0,0,width,height);grad.addColorStop(0,'#1b202a');grad.addColorStop(.55,'#171a25');grad.addColorStop(1,'#11141e');ctx.fillStyle=grad;ctx.fillRect(0,0,width,height);
    const glow=ctx.createRadialGradient(width*.72,height*.42,0,width*.72,height*.42,width*.62);glow.addColorStop(0,'rgba(77,88,68,.22)');glow.addColorStop(1,'rgba(77,88,68,0)');ctx.fillStyle=glow;ctx.fillRect(0,0,width,height);
    // Delicate, layered orchard silhouettes in the distance.
    ctx.fillStyle='rgba(9,12,19,.24)';for(let i=0;i<9;i++){const x=i*width/7-20, r=38+(i%3)*15;ctx.beginPath();ctx.arc(x,height+28,r,Math.PI,Math.PI*2);ctx.fill();}
    for(const p of ambient){ctx.globalAlpha=.2+.25*Math.sin(now*.001+p.phase);ctx.fillStyle='#d9f36a';ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,7);ctx.fill();}ctx.globalAlpha=1;
    ctx.strokeStyle='rgba(255,255,255,.035)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,height*.82);ctx.lineTo(width,height*.82);ctx.stroke();
  }
  function draw(now) {
    ctx.save();if(shake>0)ctx.translate(rand(-shake,shake),rand(-shake,shake));drawBackground(now);
    for(const f of fruits){if(f.sliced){for(const h of f.halves)drawHalf(f,h);}else if(f.type.name==='bomb')drawBomb(f);else roundedFruit(f);}
    for(const p of particles){ctx.globalAlpha=Math.max(0,p.life/p.max);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,7);ctx.fill();}ctx.globalAlpha=1;
    for(const t of trails){const a=Math.max(0,t.life/t.max);ctx.globalAlpha=a;ctx.strokeStyle='#efffa0';ctx.lineWidth=2+5*a;ctx.lineCap='round';ctx.shadowColor='#d8f36a';ctx.shadowBlur=13;ctx.beginPath();ctx.moveTo(t.x1,t.y1);ctx.lineTo(t.x2,t.y2);ctx.stroke();ctx.shadowBlur=0;}ctx.globalAlpha=1;ctx.restore();
  }
  function loop(now) { const dt=Math.min(.04,(now-last)/1000||0); last=now;update(dt);draw(now);requestAnimationFrame(loop); }
  requestAnimationFrame((t)=>{last=t;loop(t)});
  $('#startButton').addEventListener('click',start);$('#againButton').addEventListener('click',start);$('#pauseButton').addEventListener('click',pause);$('#resumeButton').addEventListener('click',resume);$('#quitButton').addEventListener('click',()=>finish('time'));
  $('#soundToggle').addEventListener('click',()=>{soundOn=!soundOn;$('#soundIcon').textContent=soundOn?'♫':'♩';$('#soundToggle').style.opacity=soundOn?'1':'.5';if(soundOn)tone(660,.1);});
  window.addEventListener('keydown',e=>{if(e.code==='Escape'||e.code==='KeyP'){if(state==='playing')pause();else if(state==='paused')resume();}if(e.code==='Space'&&(state==='menu'||state==='ended'))start();});
})();
