const $ = id => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d', { alpha: false });
const TAU = Math.PI * 2;
const WORLD_W = 3200, WORLD_H = 2400;
const COLORS = ['#f0c95d','#79a966','#d96f59','#6fa8a4','#977ab2','#d99555','#7b93c5','#b66c85','#8f9e55','#c7794f'];
const BOT_NAMES = ['Fern','Kestrel','Mochi','Bramble','Juniper','Pip','Rowan','Clover','Wren','Taro','Mallow','Ash'];
const ITEMS = [
  { id:'axe', name:'Forest Axe', key:'1', age:0 },
  { id:'spear', name:'Flint Spear', key:'2', age:1 },
  { id:'bow', name:'Reed Bow', key:'3', age:3, cost:'1W' },
  { id:'wall', name:'Palisade', key:'4', age:2, cost:'20W' },
  { id:'spike', name:'Briar Trap', key:'5', age:4, cost:'15W 10S' },
  { id:'turret', name:'Acorn Tower', key:'6', age:6, cost:'35W 25S 10G' },
];

const game = {
  mode:null, ws:null, room:'', id:null, host:false, running:false, paused:false, dead:false,
  world:null, input:{ x:0, y:0, angle:0, attack:false, interact:false, selected:0 },
  keys:new Set(), pointer:{ x:0, y:0, down:false }, camera:{ x:0, y:0 },
  last:performance.now(), sendAt:0, localTick:0, feed:[], selected:0, toastTimer:null,
};

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(innerWidth * dpr); canvas.height = Math.round(innerHeight * dpr);
  canvas.style.width = `${innerWidth}px`; canvas.style.height = `${innerHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener('resize', resize); resize();

function show(id) {
  document.querySelectorAll('.screen').forEach(el => el.classList.add('hidden'));
  $(id)?.classList.remove('hidden');
}
function playerName() {
  const value = $('player-name').value.trim().replace(/[^a-z0-9 _-]/gi, '').slice(0, 16);
  if (value) localStorage.setItem('wildbound-name', value);
  return value || 'Wanderer';
}
$('player-name').value = localStorage.getItem('wildbound-name') || '';
function toast(text) {
  $('toast').textContent = text; $('toast').classList.add('on');
  clearTimeout(game.toastTimer); game.toastTimer = setTimeout(() => $('toast').classList.remove('on'), 1800);
}
function relayBase() {
  const override = new URLSearchParams(location.search).get('relay');
  if (override) return override.replace(/\/$/, '');
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return location.origin;
  return 'https://wildbound-relay.tung-tung-tung-sahur.workers.dev';
}

$('how-button').onclick = () => $('how').classList.remove('hidden');
$('close-how').onclick = () => $('how').classList.add('hidden');
$('open-online').onclick = () => { show('online'); refreshLobbies(); };
document.querySelectorAll('[data-back="landing"]').forEach(button => button.onclick = () => show('landing'));
$('refresh').onclick = refreshLobbies;
$('play-cpu').onclick = () => startLocal(playerName());

async function refreshLobbies() {
  const list = $('lobbies'); list.innerHTML = '<p class="empty">Scanning the ranges...</p>';
  try {
    const response = await fetch(`${relayBase()}/lobbies`, { cache:'no-store' });
    if (!response.ok) throw new Error('relay unavailable');
    renderLobbies((await response.json()).lobbies || []);
  } catch (error) { list.innerHTML = `<p class="empty">${escapeHtml(error.message)}. You can still join by name.</p>`; }
}
function renderLobbies(lobbies) {
  const list = $('lobbies'); list.replaceChildren();
  if (!lobbies.length) { list.innerHTML = '<p class="empty">No open ranges. Create the first.</p>'; return; }
  for (const room of lobbies) {
    const row = document.createElement('div'); row.className = 'lobby-row';
    const info = document.createElement('div');
    const title = document.createElement('h4'); title.textContent = room.name;
    const meta = document.createElement('p'); meta.textContent = `${room.players}/${room.max} tamers · ${room.locked ? 'locked' : 'open'} · ${room.biome || 'forest'}`;
    info.append(title, meta);
    const join = document.createElement('button'); join.className = 'secondary'; join.textContent = 'JOIN';
    join.onclick = () => { $('join-name').value = room.name; connect('join', room.name, $('join-password').value); };
    row.append(info, join); list.append(row);
  }
}
function escapeHtml(value) { const div = document.createElement('div'); div.textContent = value; return div.innerHTML; }

$('create-form').onsubmit = event => {
  event.preventDefault();
  connect('create', $('room-name').value, $('room-password').value, { max:+$('room-max').value, bots:+$('room-bots').value });
};
$('join-form').onsubmit = event => { event.preventDefault(); connect('join', $('join-name').value, $('join-password').value); };

function connect(action, roomName, password = '', settings = {}) {
  const room = roomName.trim().replace(/[^a-z0-9 _-]/gi, '').replace(/\s+/g, ' ').slice(0, 24);
  if (room.length < 3) { $('online-error').textContent = 'Lobby names need at least 3 characters.'; return; }
  $('online-error').textContent = 'Connecting...';
  const url = new URL(`${relayBase().replace(/^http/, 'ws')}/ws`); url.searchParams.set('room', room);
  const ws = new WebSocket(url);
  const timer = setTimeout(() => ws.close(), 10000);
  ws.onopen = () => ws.send(JSON.stringify({ t:action, room, password, name:playerName(), settings }));
  ws.onmessage = event => handleMessage(JSON.parse(event.data));
  ws.onerror = () => $('online-error').textContent = 'Could not reach the multiplayer relay.';
  ws.onclose = () => {
    clearTimeout(timer);
    if (game.ws === ws && game.running) leaveGame('Connection to the range was lost.');
    else if (!game.id) $('online-error').textContent = 'The lobby connection closed.';
  };
  game.ws = ws; game.mode = 'online'; game.room = room;
}

function send(message) { if (game.ws?.readyState === WebSocket.OPEN) game.ws.send(JSON.stringify(message)); }
function handleMessage(message) {
  if (message.t === 'error') { $('online-error').textContent = message.message; $('lobby-wait').textContent = message.message; return; }
  if (message.t === 'welcome') { game.id = message.id; game.host = message.host; $('online-error').textContent = ''; return; }
  if (message.t === 'lobby') { renderLobby(message); return; }
  if (message.t === 'start') { game.id = message.you || game.id; beginWorld(message.world); return; }
  if (message.t === 'snapshot') { game.world = message.world; if (game.world.players[game.id]?.dead) showDeath(); updateHud(); return; }
  if (message.t === 'event') { addFeed(message.message); if (message.self) toast(message.message); return; }
  if (message.t === 'chat') addChat(message.name, message.message);
}
function renderLobby(message) {
  show('lobby'); $('lobby-name').textContent = message.name; game.host = message.host === game.id;
  const roster = $('roster'); roster.replaceChildren();
  for (const player of message.players) {
    const row = document.createElement('div'); row.className = 'roster-row';
    const dot = document.createElement('i'); dot.style.background = player.color;
    const name = document.createElement('b'); name.textContent = player.name;
    const role = document.createElement('small'); role.textContent = player.id === message.host ? 'RANGE KEEPER' : 'READY';
    row.append(dot, name, role); roster.append(row);
  }
  $('lobby-cpu').textContent = `${message.settings.bots} roaming tamers will join`;
  $('start-match').classList.toggle('hidden', !game.host); $('lobby-wait').classList.toggle('hidden', game.host);
}
$('start-match').onclick = () => send({ t:'start' });
$('leave-lobby').onclick = () => leaveGame();

function rng(seed) { return () => ((seed = Math.imul(seed ^ seed >>> 15, 1 | seed), seed ^= seed + Math.imul(seed ^ seed >>> 7, 61 | seed)), ((seed ^ seed >>> 14) >>> 0) / 4294967296); }
function makeWorld(seed = Date.now()) {
  const random = rng(seed | 0); const resources = [], animals = [], structures = [];
  for (let i=0;i<190;i++) {
    const roll=random(); const type=roll<.46?'tree':roll<.73?'rock':roll<.94?'berry':'gold';
    resources.push({ id:`r${i}`, type, x:80+random()*(WORLD_W-160), y:80+random()*(WORLD_H-160), hp:type==='gold'?110:type==='rock'?85:65, max:type==='gold'?110:type==='rock'?85:65, respawn:0 });
  }
  const species=['fox','boar','turtle','owl'];
  for (let i=0;i<40;i++) animals.push({ id:`a${i}`, species:species[i%4], x:120+random()*(WORLD_W-240), y:120+random()*(WORLD_H-240), hp:i%3===0?100:55, max:i%3===0?100:55, baby:i%3!==0, sleep:i%3!==0, owner:null, level:0, xp:0, angle:random()*TAU, cooldown:0 });
  return { seed, time:0, biome:'Forest', day:1, players:{}, resources, animals, structures, projectiles:[] };
}
function newPlayer(id, name, x, y, color, bot=false) { return { id,name,x,y,vx:0,vy:0,angle:0,color,hp:100,maxHp:100,xp:0,age:0,nextXp:80,resources:{wood:20,stone:10,food:3,gold:0},selected:0,cooldown:0,dead:false,kills:0,pets:[],bot,respawn:0,target:null }; }

function startLocal(name) {
  game.mode='local'; game.id='p1'; game.host=true;
  const world=makeWorld(Date.now()); world.players.p1=newPlayer('p1',name,WORLD_W/2,WORLD_H/2,COLORS[0]);
  for(let i=0;i<7;i++) world.players[`b${i}`]=newPlayer(`b${i}`,BOT_NAMES[i],300+Math.random()*(WORLD_W-600),300+Math.random()*(WORLD_H-600),COLORS[i+1],true);
  beginWorld(world);
}
function beginWorld(world) {
  game.world=world; game.running=true; game.paused=false; game.dead=false; game.last=performance.now();
  document.body.classList.add('playing'); $('hud').classList.remove('hidden'); $('pause').classList.add('hidden'); $('death').classList.add('hidden');
  renderHotbar(); updateHud(); toast('Gather. Age up. Tame the wild.');
}

function renderHotbar() {
  const bar=$('hotbar'); bar.replaceChildren();
  ITEMS.forEach((item,index)=>{ const slot=document.createElement('div'); slot.className=`slot ${index===game.selected?'selected':''}`; slot.innerHTML=`<small>${item.key}</small><strong>${item.name}</strong><em>${item.cost||''}</em>`; slot.onclick=()=>selectItem(index); bar.append(slot); });
}
function selectItem(index) { game.selected=index; game.input.selected=index; renderHotbar(); }
function updateHud() {
  const me=game.world?.players?.[game.id]; if(!me)return;
  $('health-fill').style.width=`${Math.max(0,me.hp/me.maxHp*100)}%`; $('health-text').textContent=`${Math.ceil(me.hp)} / ${me.maxHp}`;
  $('xp-fill').style.width=`${Math.min(100,me.xp/me.nextXp*100)}%`; $('age-text').textContent=`AGE ${me.age}`;
  $('resources').innerHTML=`<div class="resource">WOOD ${me.resources.wood|0}</div><div class="resource">STONE ${me.resources.stone|0}</div><div class="resource">FOOD ${me.resources.food|0}</div><div class="resource">GOLD ${me.resources.gold|0}</div>`;
  const pets=(game.world.animals||[]).filter(animal=>animal.owner===game.id);
  $('pet-panel').innerHTML=pets.length?`<span>${pets.map(p=>`${p.species.toUpperCase()} ${['BABY','ADULT','ELDER'][p.level]}`).join(' · ')}</span><small>${pets.map(p=>Math.ceil(p.hp)).join(' / ')} health · Q to command</small>`:'<span>NO COMPANION</span><small>Find a sleeping baby</small>';
  $('minimap').textContent=`${(game.world.biome||'Forest').toUpperCase()} · DAY ${game.world.day||1}`;
  [...$('hotbar').children].forEach((slot,i)=>slot.style.opacity=me.age>=ITEMS[i].age?'1':'.4');
}
function addFeed(message){ game.feed.unshift({message,until:performance.now()+5000}); game.feed.length=5; $('feed').innerHTML=game.feed.map(item=>`<p>${escapeHtml(item.message)}</p>`).join(''); }
function addChat(name,message){ const p=document.createElement('p'); p.textContent=`${name}: ${message}`; $('chat-lines').append(p); while($('chat-lines').children.length>5)$('chat-lines').firstChild.remove(); }

function distance(a,b){ return Math.hypot(a.x-b.x,a.y-b.y); }
function clamp(value,min,max){ return Math.max(min,Math.min(max,value)); }
function norm(x,y){ const length=Math.hypot(x,y)||1; return {x:x/length,y:y/length}; }
function getCosts(type){ return type==='wall'?{wood:20}:type==='spike'?{wood:15,stone:10}:type==='turret'?{wood:35,stone:25,gold:10}:{}; }
function canPay(player,cost){ return Object.entries(cost).every(([key,value])=>player.resources[key]>=value); }
function pay(player,cost){ Object.entries(cost).forEach(([key,value])=>player.resources[key]-=value); }
function gainXp(player,amount){ player.xp+=amount; while(player.xp>=player.nextXp){ player.xp-=player.nextXp; player.age++; player.nextXp=Math.round(player.nextXp*1.28); player.maxHp+=5; player.hp=player.maxHp; if(player.id===game.id)toast(`Age ${player.age}: new knowledge unlocked`); } }

function simulateLocal(dt) {
  const world=game.world; world.time+=dt; world.day=1+Math.floor(world.time/180); const biomes=['Forest','Frost','Dusk','Desert','Tide','Ember']; world.biome=biomes[Math.floor(world.time/75)%biomes.length];
  const me=world.players[game.id]; applyPlayerInput(me,game.input,dt); game.input.interact=false;
  for(const player of Object.values(world.players)){ player.cooldown=Math.max(0,player.cooldown-dt); if(player.dead){ player.respawn-=dt; if(player.bot&&player.respawn<=0)respawnPlayer(player); continue; } if(player.bot)updateBot(player,dt); }
  updateAnimals(world,dt); updateStructures(world,dt); updateResources(world,dt);
  if(me.dead&&!game.dead)showDeath();
}
function applyPlayerInput(player,input,dt){
  if(!player||player.dead)return; const direction=norm(input.x,input.y); const moving=Math.abs(input.x)+Math.abs(input.y)>.05; const speed=175;
  if(moving){ player.x=clamp(player.x+direction.x*speed*dt,24,WORLD_W-24); player.y=clamp(player.y+direction.y*speed*dt,24,WORLD_H-24); }
  player.angle=input.angle; player.selected=input.selected;
  if(input.attack&&player.cooldown<=0)performAction(player);
  if(input.interact)tameNearest(player);
}
function performAction(player){
  const item=ITEMS[player.selected]||ITEMS[0]; if(player.age<item.age){ if(player.id===game.id)toast(`Unlocks at age ${item.age}`); player.cooldown=.3; return; }
  if(['wall','spike','turret'].includes(item.id)){ placeStructure(player,item.id); return; }
  player.cooldown=item.id==='bow'?.7:item.id==='spear'?.48:.38; const range=item.id==='bow'?320:item.id==='spear'?94:76; const damage=item.id==='bow'?27:item.id==='spear'?31:22;
  let targets=[...game.world.resources.filter(r=>r.hp>0),...game.world.animals.filter(a=>a.hp>0&&a.owner!==player.id),...Object.values(game.world.players).filter(p=>p.id!==player.id&&!p.dead),...game.world.structures.filter(s=>s.owner!==player.id)];
  targets=targets.filter(target=>distance(player,target)<range&&Math.abs(angleDiff(player.angle,Math.atan2(target.y-player.y,target.x-player.x)))<(item.id==='bow'?.18:.7)).sort((a,b)=>distance(player,a)-distance(player,b));
  const target=targets[0]; if(!target)return; player.target=target.id;
  if(target.type&&target.id.startsWith('r')) harvest(player,target,item.id==='axe'?18:10);
  else { target.hp-=damage; if(target.hp<=0)defeat(player,target); }
}
function angleDiff(a,b){ return Math.atan2(Math.sin(b-a),Math.cos(b-a)); }
function harvest(player,node,amount){ if(node.hp<=0)return; node.hp-=amount; const yields=node.type==='tree'?['wood',4]:node.type==='rock'?['stone',3]:node.type==='berry'?['food',2]:['gold',2]; player.resources[yields[0]]+=yields[1]; gainXp(player,4); if(node.hp<=0){ node.respawn=25+Math.random()*20; gainXp(player,18); } }
function defeat(killer,target){ target.hp=0; if(target.id?.startsWith('r'))return; gainXp(killer,target.baby?22:50); killer.resources.food+=2; if(target.id in game.world.players){ target.dead=true; target.respawn=5; killer.kills++; addFeed(`${killer.name} defeated ${target.name}`); } else { target.respawn=20; } }
function placeStructure(player,type){ const cost=getCosts(type); if(!canPay(player,cost)){ if(player.id===game.id)toast('Not enough resources'); player.cooldown=.3; return; } const x=player.x+Math.cos(player.angle)*72,y=player.y+Math.sin(player.angle)*72; if(game.world.structures.some(s=>Math.hypot(s.x-x,s.y-y)<52)){ if(player.id===game.id)toast('Too close to another structure');return; } pay(player,cost); game.world.structures.push({id:`s${Date.now()}${Math.random()}`,type,x,y,owner:player.id,hp:type==='wall'?180:100,max:type==='wall'?180:100,cooldown:0}); player.cooldown=.4; }
function tameNearest(player){ const owned=game.world.animals.filter(a=>a.owner===player.id); if(owned.length>=3){ if(player.id===game.id)toast('You can guide only three companions'); return; } const pet=game.world.animals.filter(a=>a.baby&&a.sleep&&!a.owner&&a.hp>0&&distance(a,player)<80).sort((a,b)=>distance(a,player)-distance(b,player))[0]; if(!pet){ if(player.id===game.id)toast('No sleeping baby close enough'); return; } if(Math.random()<.76){ pet.owner=player.id; pet.sleep=false; pet.hp=pet.max=70; player.pets.push(pet.id); addFeed(`${player.name} befriended a ${pet.species}`); } else { pet.sleep=false; if(player.id===game.id)toast('It woke up startled'); } }
function updateBot(bot,dt){
  bot.brain=(bot.brain||0)-dt; if(bot.brain<=0){ bot.brain=.35+Math.random()*.5; const threats=Object.values(game.world.players).filter(p=>p.id!==bot.id&&!p.dead&&distance(p,bot)<240); const node=game.world.resources.filter(r=>r.hp>0).sort((a,b)=>distance(a,bot)-distance(b,bot))[0]; const baby=game.world.animals.find(a=>a.baby&&a.sleep&&!a.owner&&distance(a,bot)<100); if(baby&&Math.random()<.35)tameNearest(bot); bot.goal=threats[0]||node; if(bot.age>=2&&Math.random()<.08){ bot.selected=3+Math.floor(Math.random()*Math.min(3,Math.max(1,bot.age-1))); performAction(bot); } }
  if(!bot.goal)return; const d=distance(bot,bot.goal); bot.angle=Math.atan2(bot.goal.y-bot.y,bot.goal.x-bot.x); if(d>65){ bot.x+=Math.cos(bot.angle)*145*dt; bot.y+=Math.sin(bot.angle)*145*dt; } else if(bot.cooldown<=0){ bot.selected=bot.goal.name?1:0; performAction(bot); }
}
function updateAnimals(world,dt){ for(const animal of world.animals){ animal.cooldown=Math.max(0,(animal.cooldown||0)-dt); if(animal.hp<=0){ animal.respawn-=dt; if(animal.respawn<=0){ animal.hp=animal.max;animal.owner=null;animal.sleep=animal.baby;animal.x=100+Math.random()*(WORLD_W-200);animal.y=100+Math.random()*(WORLD_H-200); }continue; } let target=null; if(animal.owner){ target=world.players[animal.owner]; const enemy=Object.values(world.players).filter(p=>p.id!==animal.owner&&!p.dead&&distance(p,animal)<210).sort((a,b)=>distance(a,animal)-distance(b,animal))[0]; if(enemy)target=enemy; } else if(!animal.baby&&!animal.sleep){ target=Object.values(world.players).filter(p=>!p.dead).sort((a,b)=>distance(a,animal)-distance(b,animal))[0]; if(target&&distance(target,animal)>190)target=null; } if(target){ const d=distance(animal,target); animal.angle=Math.atan2(target.y-animal.y,target.x-animal.x); if(d>54){ animal.x+=Math.cos(animal.angle)*95*dt;animal.y+=Math.sin(animal.angle)*95*dt; } else if(target.hp!==undefined&&animal.cooldown<=0&&target.id!==animal.owner){ target.hp-=animal.level===2?24:12;animal.cooldown=1.1;if(target.hp<=0){target.dead=true;target.respawn=5;} } } else if(!animal.sleep){ animal.x+=Math.cos(animal.angle)*22*dt;animal.y+=Math.sin(animal.angle)*22*dt;if(Math.random()<dt*.25)animal.angle+=Math.random()*2-1; } if(animal.owner){ animal.xp+=dt*2; const needed=(animal.level+1)*45;if(animal.level<2&&animal.xp>=needed){animal.xp=0;animal.level++;animal.max+=35;animal.hp=animal.max;} } } }
function updateStructures(world,dt){ for(const structure of world.structures){structure.cooldown=Math.max(0,(structure.cooldown||0)-dt);if(structure.type==='turret'&&structure.cooldown<=0){const owner=world.players[structure.owner];const enemy=Object.values(world.players).filter(p=>p.id!==structure.owner&&!p.dead&&distance(p,structure)<280).sort((a,b)=>distance(a,structure)-distance(b,structure))[0];if(enemy){enemy.hp-=14;structure.cooldown=1;if(enemy.hp<=0)defeat(owner,enemy);}}if(structure.type==='spike'){for(const enemy of Object.values(world.players).filter(p=>p.id!==structure.owner&&!p.dead&&distance(p,structure)<34)){enemy.hp-=20*dt;if(enemy.hp<=0)defeat(world.players[structure.owner],enemy);}}} world.structures=world.structures.filter(s=>s.hp>0); }
function updateResources(world,dt){for(const node of world.resources)if(node.hp<=0){node.respawn-=dt;if(node.respawn<=0)node.hp=node.max;}}
function respawnPlayer(player){ player.dead=false;player.hp=player.maxHp;player.x=200+Math.random()*(WORLD_W-400);player.y=200+Math.random()*(WORLD_H-400);player.resources.wood=Math.max(10,Math.floor(player.resources.wood*.6));player.resources.stone=Math.floor(player.resources.stone*.6);player.resources.gold=Math.floor(player.resources.gold*.5); }

function updateInput() {
  if(game.paused||game.dead){game.input.x=game.input.y=0;game.input.attack=false;return;}
  game.input.x=(game.keys.has('d')||game.keys.has('arrowright')?1:0)-(game.keys.has('a')||game.keys.has('arrowleft')?1:0);
  game.input.y=(game.keys.has('s')||game.keys.has('arrowdown')?1:0)-(game.keys.has('w')||game.keys.has('arrowup')?1:0);
  game.input.attack=game.pointer.down||game.keys.has(' ');
  const me=game.world?.players?.[game.id]; if(me)game.input.angle=Math.atan2(game.pointer.y-innerHeight/2,game.pointer.x-innerWidth/2);
}
addEventListener('keydown',event=>{
  const key=event.key.toLowerCase(); if($('chat-input')===document.activeElement)return;
  if(['1','2','3','4','5','6'].includes(key))selectItem(+key-1);
  if(key==='e')game.input.interact=true;if(key==='r')eatFood();if(key==='enter')openChat();if(key==='escape'&&game.running)togglePause();
  game.keys.add(key);
});
addEventListener('keyup',event=>game.keys.delete(event.key.toLowerCase()));
canvas.addEventListener('pointermove',event=>{game.pointer.x=event.clientX;game.pointer.y=event.clientY});
canvas.addEventListener('pointerdown',event=>{game.pointer.down=true;game.pointer.x=event.clientX;game.pointer.y=event.clientY});
addEventListener('pointerup',()=>game.pointer.down=false);
canvas.addEventListener('contextmenu',event=>event.preventDefault());
function eatFood(){const me=game.world?.players?.[game.id];if(!me||me.resources.food<1||me.hp>=me.maxHp)return;if(game.mode==='online')send({t:'eat'});else{me.resources.food--;me.hp=Math.min(me.maxHp,me.hp+28);}}
function openChat(){const input=$('chat-input');input.classList.remove('hidden');input.focus();}
$('chat-input').onkeydown=event=>{if(event.key==='Enter'){const value=event.currentTarget.value.trim();if(value){if(game.mode==='online')send({t:'chat',message:value});else addChat(playerName(),value);}event.currentTarget.value='';event.currentTarget.classList.add('hidden');canvas.focus();}if(event.key==='Escape'){event.currentTarget.classList.add('hidden');canvas.focus();}};

function setupMobile(){const stick=$('stick'),knob=stick.querySelector('i');let active=false;const move=event=>{if(!active)return;const touch=event.touches?.[0]||event;const rect=stick.getBoundingClientRect(),dx=touch.clientX-(rect.left+rect.width/2),dy=touch.clientY-(rect.top+rect.height/2),n=norm(dx,dy),mag=Math.min(1,Math.hypot(dx,dy)/(rect.width*.35));game.input.x=n.x*mag;game.input.y=n.y*mag;knob.style.transform=`translate(${n.x*mag*30}px,${n.y*mag*30}px)`;};stick.addEventListener('pointerdown',e=>{active=true;stick.setPointerCapture(e.pointerId);move(e)});stick.addEventListener('pointermove',move);stick.addEventListener('pointerup',()=>{active=false;game.input.x=game.input.y=0;knob.style.transform=''});$('mobile-action').onpointerdown=()=>game.pointer.down=true;$('mobile-action').onpointerup=()=>game.pointer.down=false;$('mobile-tame').onclick=()=>game.input.interact=true;} setupMobile();

$('menu-button').onclick=togglePause;$('resume').onclick=togglePause;$('quit').onclick=()=>leaveGame();$('death-quit').onclick=()=>leaveGame();
$('respawn').onclick=()=>{if(game.mode==='online')send({t:'respawn'});else respawnPlayer(game.world.players[game.id]);game.dead=false;$('death').classList.add('hidden');};
function togglePause(){if(!game.running)return;game.paused=!game.paused;$('pause').classList.toggle('hidden',!game.paused);game.keys.clear();}
function showDeath(){game.dead=true;$('death').classList.remove('hidden');const me=game.world.players[game.id];$('death-stats').textContent=`Age ${me.age} · ${me.kills} rivals defeated`;}
function leaveGame(message='') { if(game.ws){game.ws.close();game.ws=null;} game.running=false;game.id=null;game.world=null;game.dead=false;document.body.classList.remove('playing');$('hud').classList.add('hidden');$('pause').classList.add('hidden');$('death').classList.add('hidden');show('landing');if(message)toast(message); }

function sendInput(now){if(game.mode!=='online'||now-game.sendAt<50)return;game.sendAt=now;send({t:'input',...game.input});game.input.interact=false;}
function frame(now){const dt=Math.min(.05,(now-game.last)/1000);game.last=now;if(game.running&&game.world){updateInput();if(game.mode==='local'&&!game.paused)simulateLocal(dt);sendInput(now);drawWorld();updateHud();}else drawBackdrop(now);requestAnimationFrame(frame);}requestAnimationFrame(frame);

function drawBackdrop(now){ctx.setTransform(devicePixelRatio>2?2:devicePixelRatio||1,0,0,devicePixelRatio>2?2:devicePixelRatio||1,0,0);ctx.fillStyle='#afc77e';ctx.fillRect(0,0,innerWidth,innerHeight);ctx.globalAlpha=.22;for(let i=0;i<20;i++){const x=(i*271+now*.004*(i%3))%innerWidth,y=(i*173)%innerHeight;drawLeaf(x,y,18+(i%4)*5,i*.7);}ctx.globalAlpha=1;}
function drawWorld(){const world=game.world,me=world.players[game.id];if(!me)return;game.camera.x+=(me.x-game.camera.x)*.12;game.camera.y+=(me.y-game.camera.y)*.12;const zoom=1;ctx.setTransform(1,0,0,1,0,0);const dpr=Math.min(devicePixelRatio||1,2);ctx.setTransform(dpr,0,0,dpr,0,0);const biomeColors={Forest:'#94b86f',Frost:'#b8d0c5',Dusk:'#847a8b',Desert:'#d6b86d',Tide:'#72aaa0',Ember:'#a56d55'};ctx.fillStyle=biomeColors[world.biome]||biomeColors.Forest;ctx.fillRect(0,0,innerWidth,innerHeight);ctx.save();ctx.translate(innerWidth/2-game.camera.x*zoom,innerHeight/2-game.camera.y*zoom);ctx.scale(zoom,zoom);drawGround(world);for(const node of world.resources)if(node.hp>0&&onScreen(node))drawResource(node);for(const structure of world.structures)if(onScreen(structure))drawStructure(structure);for(const animal of world.animals)if(animal.hp>0&&onScreen(animal))drawAnimal(animal);for(const player of Object.values(world.players))if(!player.dead&&onScreen(player))drawPlayer(player);ctx.restore();drawMinimap(world,me);drawCrosshair();const closeBaby=world.animals.find(a=>a.baby&&a.sleep&&!a.owner&&a.hp>0&&distance(a,me)<80);$('prompt').classList.toggle('hidden',!closeBaby);if(closeBaby)$('prompt').textContent=`E · BEFRIEND ${closeBaby.species.toUpperCase()}`;}
function onScreen(entity){return Math.abs(entity.x-game.camera.x)<innerWidth*.7+100&&Math.abs(entity.y-game.camera.y)<innerHeight*.7+100;}
function drawGround(world){ctx.strokeStyle='rgba(42,65,34,.09)';ctx.lineWidth=1;const left=Math.max(0,game.camera.x-innerWidth),right=Math.min(WORLD_W,game.camera.x+innerWidth),top=Math.max(0,game.camera.y-innerHeight),bottom=Math.min(WORLD_H,game.camera.y+innerHeight);for(let x=Math.floor(left/80)*80;x<right;x+=80){ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,bottom);ctx.stroke()}for(let y=Math.floor(top/80)*80;y<bottom;y+=80){ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke()}ctx.strokeStyle='rgba(38,51,34,.5)';ctx.lineWidth=8;ctx.strokeRect(0,0,WORLD_W,WORLD_H);}
function drawResource(node){ctx.save();ctx.translate(node.x,node.y);if(node.type==='tree'){ctx.fillStyle='#745433';ctx.fillRect(-8,4,16,24);ctx.fillStyle='#456d3c';for(const [x,y,r] of [[-14,-6,20],[12,-9,22],[0,-25,24]]){ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill()}}else if(node.type==='rock'||node.type==='gold'){ctx.fillStyle=node.type==='gold'?'#e9b949':'#727a70';ctx.beginPath();for(let i=0;i<7;i++){const a=i/7*TAU,r=22+(i%2)*5;i?ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r):ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r)}ctx.closePath();ctx.fill();ctx.strokeStyle='#354533';ctx.lineWidth=3;ctx.stroke()}else{ctx.fillStyle='#536d36';ctx.beginPath();ctx.arc(0,0,24,0,TAU);ctx.fill();ctx.fillStyle='#b84e43';for(let i=0;i<5;i++){ctx.beginPath();ctx.arc(Math.cos(i*2.2)*14,Math.sin(i*2.2)*12,4,0,TAU);ctx.fill()}}ctx.restore();}
function drawPlayer(player){ctx.save();ctx.translate(player.x,player.y);ctx.rotate(player.angle);ctx.fillStyle='rgba(38,51,34,.2)';ctx.beginPath();ctx.ellipse(-4,12,22,11,0,0,TAU);ctx.fill();ctx.fillStyle=player.color;ctx.strokeStyle='#263322';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,19,0,TAU);ctx.fill();ctx.stroke();ctx.fillStyle='#f1efcf';ctx.beginPath();ctx.arc(10,-6,5,0,TAU);ctx.fill();ctx.stroke();ctx.strokeStyle='#263322';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(15,3);ctx.lineTo(31,0);ctx.stroke();ctx.restore();drawBarWorld(player.x,player.y-36,player.hp/player.maxHp,player.name,player.id===game.id?'#e9b949':'#f1efcf');}
function drawAnimal(animal){ctx.save();ctx.translate(animal.x,animal.y);ctx.rotate(animal.angle);const colors={fox:'#cc7545',boar:'#765542',turtle:'#63805b',owl:'#9b8761'};ctx.fillStyle=colors[animal.species]||'#99734c';ctx.strokeStyle='#263322';ctx.lineWidth=3;const size=animal.level===2?27:animal.level===1?22:16;ctx.beginPath();ctx.ellipse(0,0,size,size*.72,0,0,TAU);ctx.fill();ctx.stroke();ctx.beginPath();ctx.arc(size*.7,-3,size*.48,0,TAU);ctx.fill();ctx.stroke();ctx.fillStyle='#263322';ctx.beginPath();ctx.arc(size*.9,-6,2.5,0,TAU);ctx.fill();if(animal.sleep){ctx.font='700 14px DM Mono';ctx.fillText('z',10,-24)}if(animal.owner){ctx.fillStyle=worldPlayerColor(animal.owner);ctx.beginPath();ctx.arc(-size,0,5,0,TAU);ctx.fill()}ctx.restore();}
function worldPlayerColor(id){return game.world.players[id]?.color||'#fff'}
function drawStructure(s){ctx.save();ctx.translate(s.x,s.y);ctx.strokeStyle='#263322';ctx.lineWidth=3;if(s.type==='wall'){ctx.fillStyle='#8b623a';ctx.fillRect(-33,-13,66,26);ctx.strokeRect(-33,-13,66,26);for(let x=-24;x<30;x+=16){ctx.beginPath();ctx.moveTo(x,-12);ctx.lineTo(x,12);ctx.stroke()}}else if(s.type==='spike'){ctx.fillStyle='#4e6737';for(let i=0;i<8;i++){ctx.rotate(TAU/8);ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(7,-8);ctx.lineTo(30,0);ctx.lineTo(7,8);ctx.closePath();ctx.fill();ctx.stroke()}}else{ctx.fillStyle='#8b623a';ctx.fillRect(-11,-28,22,56);ctx.strokeRect(-11,-28,22,56);ctx.fillStyle='#e9b949';ctx.beginPath();ctx.arc(0,-31,16,0,TAU);ctx.fill();ctx.stroke()}ctx.restore();}
function drawBarWorld(x,y,fraction,label,color){ctx.font='500 10px DM Mono';ctx.textAlign='center';ctx.fillStyle='rgba(38,51,34,.8)';ctx.fillRect(x-28,y,56,6);ctx.fillStyle=color;ctx.fillRect(x-28,y,56*clamp(fraction,0,1),6);ctx.fillStyle='#263322';ctx.fillText(label,x,y-5);}
function drawLeaf(x,y,size,angle){ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.fillStyle='#44693c';ctx.beginPath();ctx.ellipse(0,0,size,size*.42,0,0,TAU);ctx.fill();ctx.restore();}
function drawMinimap(world,me){const w=130,h=96,x=innerWidth-w-18,y=92;ctx.fillStyle='rgba(31,44,27,.72)';ctx.fillRect(x,y,w,h);ctx.strokeStyle='#f1efcf';ctx.lineWidth=2;ctx.strokeRect(x,y,w,h);for(const p of Object.values(world.players)){ctx.fillStyle=p.id===game.id?'#e9b949':'rgba(255,255,230,.7)';ctx.beginPath();ctx.arc(x+p.x/WORLD_W*w,y+p.y/WORLD_H*h,p.id===game.id?3:2,0,TAU);ctx.fill()}ctx.fillStyle='#b84e43';for(const animal of world.animals.filter(a=>!a.baby&&a.hp>0)){ctx.fillRect(x+animal.x/WORLD_W*w-1,y+animal.y/WORLD_H*h-1,2,2)}}
function drawCrosshair(){ctx.strokeStyle='rgba(255,255,230,.8)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(game.pointer.x,game.pointer.y,7,0,TAU);ctx.moveTo(game.pointer.x-11,game.pointer.y);ctx.lineTo(game.pointer.x+11,game.pointer.y);ctx.moveTo(game.pointer.x,game.pointer.y-11);ctx.lineTo(game.pointer.x,game.pointer.y+11);ctx.stroke();}
