import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js';

/* ========= CONSTANTES ========= */
const ENEMY_SPEED          = 0.045;
const BOSS_INTERVAL        = 30_000;
const BOSS_HP_MAX          = 20;
const LASER_SPEED          = 0.07;
const BOSS_LASER_INTERVAL  = 2_500;
const BULLET_COOLDOWN      = 250;
const LASER_SOUND_COOLDOWN = 200;
const PARTICLE_LIFETIME    = 0.25;
const PARTICLE_CHANCE      = 0.20;
const COMBO_WINDOW         = 1500;   // ms
/* ============================== */

/* ---------- AUDIO ---------- */
const bgMusic  = document.getElementById('bg-audio').src = './assets/audio/background.mp3';
const sfxLaser = document.getElementById('sfx-laser');
const sfxHit   = document.getElementById('sfx-hit');
const sfxPow   = document.getElementById('sfx-power');
const sfxBoss  = document.getElementById('sfx-boss');
function playSFX(el){
  const c = el.cloneNode(); c.volume = 0.5 + Math.random()*0.3; c.play().catch(()=>{});
}

/* ---------- THREE ---------- */
const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setSize(innerWidth,innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene  = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60,innerWidth/innerHeight,0.1,1000);
camera.position.z = 12;
scene.add(new THREE.PointLight(0xffffff,.4).position.set(0,5,10));
scene.add(new THREE.AmbientLight(0xffffff,.2));

/* ---------- TEXTURAS ---------- */
const L = new THREE.TextureLoader();
const shipTex = L.load('./assets/images/player.png');
const alienTex= L.load('./assets/images/alien.png');
const bossTex = L.load('./assets/images/boss.png');
const heartTex= L.load('./assets/images/heart.png');
const shieldTex=L.load('./assets/images/shield.png');
const doubleTex=L.load('./assets/images/double.png');
const slowTex  =L.load('./assets/images/slow.png');
const particleTex=L.load('./assets/images/particle.png');
L.load('./assets/images/bg.png',t=>scene.background=t);

/* ---------- SPRITES ---------- */
const player = new THREE.Sprite(new THREE.SpriteMaterial({map:shipTex,transparent:true}));
player.scale.set(1.2,1.2,1); scene.add(player);

/* Boss pré-carregado */
const bossTemplate = new THREE.Sprite(new THREE.SpriteMaterial({map:bossTex,transparent:true}));
bossTemplate.scale.set(4,4,1); bossTemplate.visible=false; scene.add(bossTemplate);

/* ---------- ESTADO ---------- */
const bullets=[], enemies=[], powerUps=[], particles=[];
let boss=null,bossHP=0,lastBoss=0,lastBossShot=0,bossLaser=null;
let lastBullet=0,lastEnemy=0,lastLaserSound=0;

/* combo */
let combo      = 1;
let comboTimer = 0;

/* pontuação */
let score=0; const scoreEl = document.getElementById('score');

/* recorde */
const BEST_KEY = 'cbb_best';
let bestScore = Number(localStorage.getItem(BEST_KEY) || 0);
document.getElementById('best-label').textContent = `Melhor score: ${bestScore}`;

/* vidas/escudo */
let lives=3; let shieldActive=false;

/* ---------- DOM refs rápidos ---------- */
const livesEl=document.getElementById('lives');
const comboEl=document.getElementById('combo');
const bossBar=document.getElementById('bossbar');
const bossIn =document.getElementById('bossbar-inner');
const radar  =document.getElementById('radar');
const rctx   =radar.getContext('2d');

/* ---------- UI helpers ---------- */
function renderLives(){
  livesEl.innerHTML='';
  for(let i=0;i<lives;i++){
    const h=document.createElement('div');h.className='heart';livesEl.appendChild(h);
  }
}
renderLives();

/* ---------- MENU ---------- */
const menuEl=document.getElementById('menu');
setTimeout(()=>menuEl.classList.add('fade-in'),100);

document.getElementById('play').onclick=()=>{
  menuEl.style.display='none';
  uiEl.style.display='flex';
  volEl.style.display='block';
  playing=true;
  document.body.style.cursor='none';
  bgMusic.volume=0.4; bgMusic.play().catch(()=>{});
};

/* (resto dos botões mantém igual) */
document.getElementById('exit-button').onclick=()=>window.close();
document.getElementById('restart').onclick   =()=>location.reload();
document.getElementById('pause-exit').onclick=()=>location.reload();
document.getElementById('continue').onclick  =resumeCountdown;
document.getElementById('volume-down').onclick=()=>{bgMusic.volume=Math.max(0,bgMusic.volume-0.1);};
document.getElementById('volume-up').onclick  =()=>{bgMusic.volume=Math.min(1,bgMusic.volume+0.1);};

const uiEl=document.getElementById('ui');
const pauseEl=document.getElementById('pause-menu');
const volEl=document.getElementById('volume-controls');

/* ---------- INPUT ---------- */
window.addEventListener('pointermove',e=>{
  const x=(e.clientX/innerWidth-0.5)*20;
  const y=(-(e.clientY/innerHeight)+0.5)*12;
  player.position.set(x,y,0);
});
window.addEventListener('resize',()=>{
  camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
});
window.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&playing&&alive&&!paused)enterPause();
});

/* ---------- PAUSE ---------- */
let playing=false,paused=false,alive=true;
function enterPause(){
  paused=true;document.body.style.cursor='auto';
  pauseEl.style.display='block';requestAnimationFrame(()=>pauseEl.classList.add('fade-in'));
  bgMusic.pause();
}
function resumeCountdown(){
  pauseEl.style.display='none';
  countEl.style.display='block';
  let c=3;countEl.textContent=c;
  const id=setInterval(()=>{
    c--;if(c>0)countEl.textContent=c;
    else{clearInterval(id);countEl.style.display='none';paused=false;
      document.body.style.cursor='none';bgMusic.play().catch(()=>{});}
  },1000);
}
const countEl=document.getElementById('countdown');

/* ---------- SPAWNS ---------- */
function spawnBullet(){
  const now=performance.now();
  const mk=off=>{
    const geo=new THREE.PlaneGeometry(1,0.16);
    const mat=new THREE.MeshBasicMaterial({color:0xff66ff,side:THREE.DoubleSide});
    const b=new THREE.Mesh(geo,mat);b.rotation.y=Math.PI/2;
    b.position.copy(player.position);b.position.x+=off;
    bullets.push(b);scene.add(b);
  };
  doubleShot?(mk(-0.25),mk(0.25)):mk(0);
  if(now-lastLaserSound>LASER_SOUND_COOLDOWN){playSFX(sfxLaser);lastLaserSound=now;}
}
function spawnEnemy(){
  const s=1+(Math.random()-0.5)*0.6;
  const e=new THREE.Sprite(new THREE.SpriteMaterial({map:alienTex,transparent:true}));
  e.scale.set(1.3*s,1.3*s,1);const ang=Math.random()*Math.PI*2,r=14;
  e.position.set(Math.cos(ang)*r,Math.sin(ang)*r,0);
  const v=ENEMY_SPEED/s;
  const dir=new THREE.Vector3(-e.position.x,-e.position.y,0)
            .add(new THREE.Vector3(Math.random()-0.5,Math.random()-0.5,0))
            .normalize().multiplyScalar(v);
  e.userData={dir};enemies.push(e);scene.add(e);
}
function spawnPowerUp(pos){
  const types=['heart','shield','double','slow'];
  const type=types[Math.floor(Math.random()*types.length)];
  const tex={heart:heartTex,shield:shieldTex,double:doubleTex,slow:slowTex}[type];
  const p=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true}));
  p.scale.set(0.9,0.9,1);p.position.copy(pos);p.userData={type};
  powerUps.push(p);scene.add(p);
}
function spawnBoss(){boss=bossTemplate;boss.position.set(0,11,0);boss.visible=true;
  bossHP=BOSS_HP_MAX;bossBar.style.display='block';bossIn.style.width='100%';playSFX(sfxBoss);}
function spawnBossLaser(){
  if(!boss)return;
  const geo=new THREE.BoxGeometry(0.25,0.25,2);
  const mat=new THREE.MeshBasicMaterial({color:0xff00ff});
  bossLaser=new THREE.Mesh(geo,mat);bossLaser.position.copy(boss.position);
  const dir=new THREE.Vector3().subVectors(player.position,boss.position).normalize();
  bossLaser.userData={dir};bossLaser.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),dir);
  scene.add(bossLaser);
}

/* ---------- COMBO helpers ---------- */
function addScore(base){
  score+=base*combo; scoreEl.textContent=score;
  comboTimer=performance.now(); combo++;
  if(combo>1)showCombo();
}
function showCombo(){
  comboEl.textContent=`Combo x${combo}!`;
  comboEl.style.opacity=1;comboEl.style.transform='translateX(-50%) scale(1)';
  setTimeout(()=>{comboEl.style.opacity=0;comboEl.style.transform='translateX(-50%) scale(0.5)';},700);
}

/* ---------- DANO ---------- */
function damagePlayer(){
  lives--;renderLives();player.material.color.set(0xff0000);
  setTimeout(()=>player.material.color.set(0xffffff),120);
  if(lives<=0){alive=false;gameOver();}
}

/* ---------- MAIN LOOP ---------- */
let prevTime=performance.now();
function animate(t){
  requestAnimationFrame(animate);
  const dt=Math.max((t-prevTime)/16.666,1); prevTime=t;
  if(!playing||paused||!alive)return;

  /* spawns */
  if(t-lastBullet>BULLET_COOLDOWN){spawnBullet();lastBullet=t;}
  if(t-lastEnemy>900){spawnEnemy();lastEnemy=t;}
  if(!boss&&t-lastBoss>BOSS_INTERVAL){spawnBoss();lastBoss=t;}

  /* bullets */
  bullets.forEach((b,i)=>{
    b.position.y+=1.2*dt;
    if(Math.random()<PARTICLE_CHANCE){
      const p=new THREE.Sprite(new THREE.SpriteMaterial({map:particleTex,color:0xff66ff,transparent:true,opacity:0.6}));
      p.scale.set(0.25,0.25,1);p.position.copy(b.position);
      particles.push({sprite:p,life:PARTICLE_LIFETIME});scene.add(p);
    }
    if(boss&&b.position.distanceTo(boss.position)<2){
      scene.remove(b);bullets.splice(i,1);bossHP--;bossIn.style.width=`${bossHP/BOSS_HP_MAX*100}%`;
      if(bossHP<=0){boss.visible=false;boss=null;bossBar.style.display='none';addScore(10);}
      return;
    }
    if(b.position.y>15){scene.remove(b);bullets.splice(i,1);}
  });

  /* partículas fade */
  particles.forEach((p,i)=>{
    p.life-=0.016*dt;p.sprite.material.opacity=p.life/PARTICLE_LIFETIME;
    if(p.life<=0){scene.remove(p.sprite);particles.splice(i,1);}
  });

  /* combo timeout */
  if(combo>1&&performance.now()-comboTimer>COMBO_WINDOW){combo=1;}

  /* enemies */
  enemies.forEach((e,ei)=>{
    e.position.addScaledVector(e.userData.dir,1.25*dt);
    if(e.position.length()>20){scene.remove(e);enemies.splice(ei,1);return;}
    if(e.position.distanceTo(player.position)<0.8){
      if(!shieldActive)damagePlayer();
      scene.remove(e);enemies.splice(ei,1);return;
    }
    bullets.forEach((b,bi)=>{
      if(e.position.distanceTo(b.position)<0.8){
        scene.remove(e);enemies.splice(ei,1);
        scene.remove(b);bullets.splice(bi,1);
        playSFX(sfxHit);addScore(1);if(Math.random()<0.35)spawnPowerUp(e.position);
      }
    });
  });

  /* boss movement + lazer */
  if(boss){
    boss.position.y-=0.03*dt;boss.rotation.z+=0.015*dt;if(boss.position.y<4)boss.position.y=4;
    if(t-lastBossShot>BOSS_LASER_INTERVAL){spawnBossLaser();lastBossShot=t;}
  }
  if(bossLaser){
    bossLaser.position.addScaledVector(bossLaser.userData.dir,LASER_SPEED*1.3*dt);
    if(bossLaser.position.distanceTo(player.position)<1.2){
      if(!shieldActive)damagePlayer();scene.remove(bossLaser);bossLaser=null;
    }else if(Math.abs(bossLaser.position.x)>20||Math.abs(bossLaser.position.y)>20){
      scene.remove(bossLaser);bossLaser=null;
    }
  }

  /* power-ups */
  powerUps.forEach((p,pi)=>{
    p.position.y-=0.045*dt;
    if(p.position.distanceTo(player.position)<0.8){
      collect(p.userData.type);scene.remove(p);powerUps.splice(pi,1);
    }else if(p.position.y<-15){scene.remove(p);powerUps.splice(pi,1);}
  });

  /* ---------- RADAR ---------- */
  rctx.clearRect(0,0,radar.width,radar.height);
  rctx.strokeStyle='#fff';rctx.lineWidth=2;
  const R=70; rctx.beginPath();rctx.arc(R,R,R-2,0,Math.PI*2);rctx.stroke();
  const toRadar=(v)=>{
    const scale=4;           // quão longe cabe no radar
    return {x:R+v.x/scale,y:R-v.y/scale};
  };
  enemies.forEach(e=>{
    const v=e.position.clone().sub(player.position);
    const pos=toRadar(v);
    if((pos.x-R)**2+(pos.y-R)**2<(R-4)**2){
      rctx.fillStyle='#0f0';rctx.beginPath();rctx.arc(pos.x,pos.y,4,0,Math.PI*2);rctx.fill();
    }
  });

  renderer.render(scene,camera);
}
requestAnimationFrame(animate);

/* ---------- POWER-UPS ---------- */
function collect(type){
  playSFX(sfxPow);
  if(type==='heart'){if(lives<3){lives++;renderLives();}}
  else if(type==='shield'){shieldActive=true;shieldHUD.style.display='block';
    clearTimeout(shieldTimer);shieldTimer=setTimeout(()=>{shieldActive=false;shieldHUD.style.display='none';},5000);}
  else if(type==='double'){doubleShot=true;clearTimeout(doubleTimer);doubleTimer=setTimeout(()=>doubleShot=false,5000);}
  else if(type==='slow'){/* slow-mo 3 s */
    slowMo=true;scene.children.forEach(o=>{if(o.userData&&o.userData.dir)o.userData.dir.multiplyScalar(0.4);});
    clearTimeout(slowTimer);slowTimer=setTimeout(()=>{slowMo=false;scene.children.forEach(o=>{if(o.userData&&o.userData.dir)o.userData.dir.multiplyScalar(2.5);});},3000);}
}

/* ---------- GAMEOVER ---------- */
function gameOver(){
  document.getElementById('final-score').textContent=`Score: ${score}`;
  document.getElementById('gameover').style.display='block';
  bgMusic.pause();
  if(score>bestScore){bestScore=score;localStorage.setItem(BEST_KEY,bestScore);}
}
