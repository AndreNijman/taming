const WORLD_W = 3200, WORLD_H = 2400;
const TICK_MS = 50, SNAPSHOT_MS = 100, ROOM_TTL = 45 * 60_000;
const COLORS = ['#f0c95d','#79a966','#d96f59','#6fa8a4','#977ab2','#d99555','#7b93c5','#b66c85','#8f9e55','#c7794f','#648a91','#bc8b55','#7d77a0','#75a16f','#c06b6b','#8e9365'];
const BOT_NAMES = ['Fern','Kestrel','Mochi','Bramble','Juniper','Pip','Rowan','Clover','Wren','Taro','Mallow','Ash'];
const ITEMS = [
  { id:'axe', age:0 }, { id:'spear', age:1 }, { id:'bow', age:3 },
  { id:'wall', age:2 }, { id:'spike', age:4 }, { id:'turret', age:6 },
];
const encoder = new TextEncoder();

function cleanName(value, fallback = 'Wanderer', max = 16) {
  const name = String(value || '').replace(/[^a-z0-9 _-]/gi, '').replace(/\s+/g, ' ').trim().slice(0, max);
  return name || fallback;
}
function roomKey(value) { return cleanName(value, '', 24).toLowerCase(); }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function norm(x, y) { const length = Math.hypot(x, y) || 1; return { x:x/length, y:y/length }; }
function angleDiff(a, b) { return Math.atan2(Math.sin(b-a), Math.cos(b-a)); }
function json(data, status = 200) { return Response.json(data, { status, headers:{ 'Access-Control-Allow-Origin':'*', 'Cache-Control':'no-store' } }); }
async function hash(value) { const bytes = await crypto.subtle.digest('SHA-256', encoder.encode(String(value || '').slice(0, 40))); return [...new Uint8Array(bytes)].map(v=>v.toString(16).padStart(2,'0')).join(''); }
function rng(seed) { return () => ((seed = Math.imul(seed ^ seed >>> 15, 1 | seed), seed ^= seed + Math.imul(seed ^ seed >>> 7, 61 | seed)), ((seed ^ seed >>> 14) >>> 0) / 4294967296); }

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers:{ 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Methods':'GET,OPTIONS', 'Access-Control-Allow-Headers':'Content-Type' } });
    if (url.pathname === '/health') return json({ ok:true });
    if (url.pathname === '/lobbies') return env.REGISTRY.getByName('global').fetch(new Request('https://registry/list'));
    if (url.pathname !== '/ws' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('Wildbound relay', { status:404 });
    const key = roomKey(url.searchParams.get('room'));
    if (key.length < 3) return new Response('invalid lobby name', { status:400 });
    return env.ROOMS.getByName(key).fetch(request);
  }
};

export class LobbyRegistry {
  constructor(ctx) { this.ctx = ctx; }
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === '/list') {
      const entries = await this.ctx.storage.list({ prefix:'room:' }); const now = Date.now(), lobbies=[];
      for (const [key, value] of entries) {
        if (!value.updated || now-value.updated>120_000 || value.players >= value.max || value.started) await this.ctx.storage.delete(key);
        else lobbies.push(value);
      }
      lobbies.sort((a,b)=>b.updated-a.updated); return json({ lobbies });
    }
    const body = await request.json(); const key=`room:${body.key}`;
    if (path === '/upsert') { await this.ctx.storage.put(key, body.lobby); return new Response(null,{status:204}); }
    if (path === '/remove') { await this.ctx.storage.delete(key); return new Response(null,{status:204}); }
    return new Response('not found',{status:404});
  }
}

function createWorld(seed = Date.now()) {
  const random=rng(seed|0), resources=[], animals=[];
  for(let i=0;i<190;i++){
    const roll=random(),type=roll<.46?'tree':roll<.73?'rock':roll<.94?'berry':'gold',max=type==='gold'?110:type==='rock'?85:65;
    resources.push({id:`r${i}`,type,x:80+random()*(WORLD_W-160),y:80+random()*(WORLD_H-160),hp:max,max,respawn:0});
  }
  const species=['fox','boar','turtle','owl'];
  for(let i=0;i<40;i++)animals.push({id:`a${i}`,species:species[i%4],x:120+random()*(WORLD_W-240),y:120+random()*(WORLD_H-240),hp:i%3===0?100:55,max:i%3===0?100:55,baby:i%3!==0,sleep:i%3!==0,owner:null,level:0,xp:0,angle:random()*Math.PI*2,cooldown:0,respawn:0});
  return {seed,time:0,biome:'Forest',day:1,players:{},resources,animals,structures:[],projectiles:[]};
}
function newPlayer(id,name,x,y,color,bot=false){return{id,name,x,y,angle:0,color,hp:100,maxHp:100,xp:0,age:0,nextXp:80,resources:{wood:20,stone:10,food:3,gold:0},selected:0,cooldown:0,dead:false,kills:0,pets:[],bot,respawn:0,target:null,input:{x:0,y:0,angle:0,attack:false,interact:false,selected:0},brain:0,goal:null};}
function publicPlayer(player){const copy={...player};delete copy.input;delete copy.brain;delete copy.goal;return copy;}

export class GameRoom {
  constructor(ctx, env) {
    this.ctx=ctx;this.env=env;this.sessions=new Map();this.players=new Map();this.room='';this.key='';this.host=null;this.settings={max:8,bots:4};this.password='';this.started=false;this.world=null;this.nextId=1;this.timer=null;this.lastTick=0;this.lastSnapshot=0;this.touched=Date.now();
  }
  async fetch(request){
    if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return new Response('upgrade required',{status:426});
    const pair=new WebSocketPair(),client=pair[0],server=pair[1];server.accept();
    const session={socket:server,id:null,ready:false};this.sessions.set(server,session);this.touched=Date.now();
    const timeout=setTimeout(()=>{if(!session.ready)server.close(1008,'handshake timeout')},10_000);
    server.addEventListener('message',event=>this.onMessage(session,event.data).catch(error=>{console.error(error);this.send(server,{t:'error',message:'Relay error'});}));
    server.addEventListener('close',()=>{clearTimeout(timeout);this.remove(session)});server.addEventListener('error',()=>this.remove(session));
    this.ensureTimer();return new Response(null,{status:101,webSocket:client});
  }
  send(socket,message){if(socket.readyState===1)socket.send(JSON.stringify(message));}
  broadcast(message){const encoded=JSON.stringify(message);for(const session of this.sessions.values())if(session.ready&&session.socket.readyState===1)session.socket.send(encoded);}
  event(message,selfId=null){this.broadcast({t:'event',message,self:false});if(selfId){const player=this.players.get(selfId);if(player&&!player.bot){const session=[...this.sessions.values()].find(s=>s.id===selfId);if(session)this.send(session.socket,{t:'event',message,self:true});}}}

  async onMessage(session,raw){
    if(typeof raw!=='string'||raw.length>8192)return;let message;try{message=JSON.parse(raw)}catch{return}this.touched=Date.now();
    if(!session.ready){await this.join(session,message);return}const player=this.players.get(session.id);if(!player)return;
    if(message.t==='start'){if(session.id===this.host&&!this.started)this.start();return}
    if(message.t==='input'&&this.started){player.input={x:clamp(Number(message.x)||0,-1,1),y:clamp(Number(message.y)||0,-1,1),angle:Number.isFinite(message.angle)?message.angle:player.angle,attack:!!message.attack,interact:!!message.interact,selected:clamp(Math.floor(Number(message.selected)||0),0,5)};return}
    if(message.t==='eat'&&this.started&&!player.dead&&player.resources.food>0&&player.hp<player.maxHp){player.resources.food--;player.hp=Math.min(player.maxHp,player.hp+28);return}
    if(message.t==='respawn'&&this.started&&player.dead&&player.respawn<=0){this.respawn(player);return}
    if(message.t==='chat'){const text=String(message.message||'').replace(/[^\x20-\x7e]/g,'').trim().slice(0,100);if(text)this.broadcast({t:'chat',name:player.name,message:text});}
  }
  async join(session,message){
    if(!['create','join'].includes(message.t)){this.send(session.socket,{t:'error',message:'Create or join first'});session.socket.close(1008);return}
    const requested=cleanName(message.room,'',24),key=roomKey(requested);if(key.length<3){this.reject(session,'Invalid lobby name');return}
    if(message.t==='create'){
      if(this.room||this.players.size){this.reject(session,'A lobby with that name already exists');return}
      this.room=requested;this.key=key;this.settings={max:clamp(Math.round(message.settings?.max||8),2,16),bots:clamp(Math.round(message.settings?.bots||0),0,8)};this.settings.bots=Math.min(this.settings.bots,this.settings.max-1);this.password=await hash(message.password||'');
    }else{
      if(!this.room){this.reject(session,'No open lobby has that name');return}
      if(this.started){this.reject(session,'That expedition has already started');return}
      if(this.players.size>=this.settings.max){this.reject(session,'That lobby is full');return}
      if(this.password!==await hash(message.password||'')){this.reject(session,'Wrong lobby password');return}
    }
    const id=`p${this.nextId++}`,player=newPlayer(id,cleanName(message.name),0,0,COLORS[(this.nextId-2)%COLORS.length]);this.players.set(id,player);session.id=id;session.ready=true;if(!this.host)this.host=id;
    this.send(session.socket,{t:'welcome',id,host:id===this.host});this.sendLobby();await this.syncRegistry();
  }
  reject(session,message){this.send(session.socket,{t:'error',message});setTimeout(()=>session.socket.close(1008,message),20)}
  remove(session){
    this.sessions.delete(session.socket);if(!session.id)return;const wasHost=session.id===this.host;this.players.delete(session.id);if(this.world)delete this.world.players[session.id];
    if(!this.players.size){this.reset();return}if(wasHost)this.host=this.players.keys().next().value;this.sendLobby();this.syncRegistry();
  }
  reset(){this.removeRegistry();this.room='';this.key='';this.host=null;this.players.clear();this.started=false;this.world=null;this.password='';if(this.timer){clearInterval(this.timer);this.timer=null}}
  sendLobby(){this.broadcast({t:'lobby',name:this.room,host:this.host,settings:this.settings,players:[...this.players.values()].map(p=>({id:p.id,name:p.name,color:p.color}))});}
  async syncRegistry(){if(!this.key)return;const lobby={name:this.room,key:this.key,players:this.players.size,max:this.settings.max,locked:!!this.password,started:this.started,biome:this.world?.biome||'Forest',updated:Date.now()};await this.env.REGISTRY.getByName('global').fetch(new Request('https://registry/upsert',{method:'POST',body:JSON.stringify({key:this.key,lobby})}));}
  async removeRegistry(){if(!this.key)return;await this.env.REGISTRY.getByName('global').fetch(new Request('https://registry/remove',{method:'POST',body:JSON.stringify({key:this.key})}));}

  start(){
    this.started=true;this.world=createWorld(Date.now());let index=0;
    for(const player of this.players.values()){Object.assign(player,newPlayer(player.id,player.name,500+index*55,WORLD_H/2+(index%2)*70,player.color));player.bot=false;this.world.players[player.id]=player;index++}
    for(let i=0;i<this.settings.bots&&this.players.size+i<this.settings.max;i++){const id=`b${i}`,bot=newPlayer(id,BOT_NAMES[i%BOT_NAMES.length],300+Math.random()*(WORLD_W-600),300+Math.random()*(WORLD_H-600),COLORS[(index+i)%COLORS.length],true);this.world.players[id]=bot;}
    this.removeRegistry();for(const session of this.sessions.values())if(session.ready)this.send(session.socket,{t:'start',you:session.id,world:this.serializedWorld()});this.lastTick=Date.now();
  }
  ensureTimer(){if(this.timer)return;this.timer=setInterval(()=>this.tick(),TICK_MS)}
  tick(){
    const now=Date.now();if(now-this.touched>ROOM_TTL){for(const session of this.sessions.values())session.socket.close(1000,'lobby idle');this.reset();return}if(!this.started||!this.world){return}
    const dt=Math.min(.1,(now-this.lastTick)/1000||.05);this.lastTick=now;this.world.time+=dt;this.world.day=1+Math.floor(this.world.time/180);this.world.biome=['Forest','Frost','Dusk','Desert','Tide','Ember'][Math.floor(this.world.time/75)%6];
    for(const player of Object.values(this.world.players)){player.cooldown=Math.max(0,player.cooldown-dt);if(player.dead){player.respawn=Math.max(0,player.respawn-dt);if(player.bot&&player.respawn<=0)this.respawn(player);continue}if(player.bot)this.updateBot(player,dt);else this.applyInput(player,dt)}
    this.updateAnimals(dt);this.updateStructures(dt);this.updateResources(dt);
    if(now-this.lastSnapshot>=SNAPSHOT_MS){this.lastSnapshot=now;this.broadcast({t:'snapshot',world:this.serializedWorld()})}
    if(Math.floor(now/15000)!==Math.floor((now-TICK_MS)/15000))this.syncRegistry();
  }
  serializedWorld(){return{seed:this.world.seed,time:this.world.time,biome:this.world.biome,day:this.world.day,players:Object.fromEntries(Object.entries(this.world.players).map(([id,p])=>[id,publicPlayer(p)])),resources:this.world.resources,animals:this.world.animals,structures:this.world.structures,projectiles:[]}}
  applyInput(player,dt){const input=player.input,direction=norm(input.x,input.y),moving=Math.abs(input.x)+Math.abs(input.y)>.05;if(moving){player.x=clamp(player.x+direction.x*175*dt,24,WORLD_W-24);player.y=clamp(player.y+direction.y*175*dt,24,WORLD_H-24)}player.angle=input.angle;player.selected=input.selected;if(input.attack&&player.cooldown<=0)this.performAction(player);if(input.interact){this.tameNearest(player);input.interact=false}}
  gainXp(player,amount){player.xp+=amount;while(player.xp>=player.nextXp){player.xp-=player.nextXp;player.age++;player.nextXp=Math.round(player.nextXp*1.28);player.maxHp+=5;player.hp=player.maxHp;this.event(`${player.name} reached age ${player.age}`,player.id)}}
  performAction(player){
    const item=ITEMS[player.selected]||ITEMS[0];if(player.age<item.age){player.cooldown=.3;return}if(['wall','spike','turret'].includes(item.id)){this.placeStructure(player,item.id);return}
    player.cooldown=item.id==='bow'?.7:item.id==='spear'?.48:.38;const range=item.id==='bow'?320:item.id==='spear'?94:76,damage=item.id==='bow'?27:item.id==='spear'?31:22;
    let targets=[...this.world.resources.filter(r=>r.hp>0),...this.world.animals.filter(a=>a.hp>0&&a.owner!==player.id),...Object.values(this.world.players).filter(p=>p.id!==player.id&&!p.dead),...this.world.structures.filter(s=>s.owner!==player.id)];
    targets=targets.filter(target=>distance(player,target)<range&&Math.abs(angleDiff(player.angle,Math.atan2(target.y-player.y,target.x-player.x)))<(item.id==='bow'?.18:.7)).sort((a,b)=>distance(player,a)-distance(player,b));const target=targets[0];if(!target)return;player.target=target.id;
    if(target.id.startsWith('r'))this.harvest(player,target,item.id==='axe'?18:10);else{target.hp-=damage;if(target.hp<=0)this.defeat(player,target)}
  }
  harvest(player,node,amount){if(node.hp<=0)return;node.hp-=amount;const yields=node.type==='tree'?['wood',4]:node.type==='rock'?['stone',3]:node.type==='berry'?['food',2]:['gold',2];player.resources[yields[0]]+=yields[1];this.gainXp(player,4);if(node.hp<=0){node.respawn=25+Math.random()*20;this.gainXp(player,18)}}
  defeat(killer,target){target.hp=0;this.gainXp(killer,target.baby?22:50);killer.resources.food+=2;if(target.id in this.world.players){target.dead=true;target.respawn=5;killer.kills++;this.event(`${killer.name} defeated ${target.name}`)}else target.respawn=20}
  placeStructure(player,type){const costs={wall:{wood:20},spike:{wood:15,stone:10},turret:{wood:35,stone:25,gold:10}},cost=costs[type];if(!Object.entries(cost).every(([k,v])=>player.resources[k]>=v)){player.cooldown=.3;return}const x=player.x+Math.cos(player.angle)*72,y=player.y+Math.sin(player.angle)*72;if(this.world.structures.some(s=>Math.hypot(s.x-x,s.y-y)<52))return;Object.entries(cost).forEach(([k,v])=>player.resources[k]-=v);this.world.structures.push({id:`s${crypto.randomUUID()}`,type,x,y,owner:player.id,hp:type==='wall'?180:100,max:type==='wall'?180:100,cooldown:0});player.cooldown=.4}
  tameNearest(player){const owned=this.world.animals.filter(a=>a.owner===player.id);if(owned.length>=3)return;const pet=this.world.animals.filter(a=>a.baby&&a.sleep&&!a.owner&&a.hp>0&&distance(a,player)<80).sort((a,b)=>distance(a,player)-distance(b,player))[0];if(!pet)return;if(Math.random()<.76){pet.owner=player.id;pet.sleep=false;pet.hp=pet.max=70;player.pets.push(pet.id);this.event(`${player.name} befriended a ${pet.species}`,player.id)}else{pet.sleep=false;this.event('The animal woke up startled',player.id)}}
  updateBot(bot,dt){bot.brain-=dt;if(bot.brain<=0){bot.brain=.35+Math.random()*.5;const threats=Object.values(this.world.players).filter(p=>p.id!==bot.id&&!p.dead&&distance(p,bot)<240),node=this.world.resources.filter(r=>r.hp>0).sort((a,b)=>distance(a,bot)-distance(b,bot))[0],baby=this.world.animals.find(a=>a.baby&&a.sleep&&!a.owner&&distance(a,bot)<100);if(baby&&Math.random()<.35)this.tameNearest(bot);bot.goal=threats[0]||node;if(bot.age>=2&&Math.random()<.08){bot.selected=3+Math.floor(Math.random()*Math.min(3,Math.max(1,bot.age-1)));this.performAction(bot)}}if(!bot.goal)return;const d=distance(bot,bot.goal);bot.angle=Math.atan2(bot.goal.y-bot.y,bot.goal.x-bot.x);if(d>65){bot.x=clamp(bot.x+Math.cos(bot.angle)*145*dt,24,WORLD_W-24);bot.y=clamp(bot.y+Math.sin(bot.angle)*145*dt,24,WORLD_H-24)}else if(bot.cooldown<=0){bot.selected=bot.goal.name?1:0;this.performAction(bot)}}
  updateAnimals(dt){for(const animal of this.world.animals){animal.cooldown=Math.max(0,(animal.cooldown||0)-dt);if(animal.hp<=0){animal.respawn-=dt;if(animal.respawn<=0){animal.hp=animal.max;animal.owner=null;animal.sleep=animal.baby;animal.x=100+Math.random()*(WORLD_W-200);animal.y=100+Math.random()*(WORLD_H-200)}continue}let target=null;if(animal.owner){target=this.world.players[animal.owner];const enemy=Object.values(this.world.players).filter(p=>p.id!==animal.owner&&!p.dead&&distance(p,animal)<210).sort((a,b)=>distance(a,animal)-distance(b,animal))[0];if(enemy)target=enemy}else if(!animal.baby&&!animal.sleep){target=Object.values(this.world.players).filter(p=>!p.dead).sort((a,b)=>distance(a,animal)-distance(b,animal))[0];if(target&&distance(target,animal)>190)target=null}if(target){const d=distance(animal,target);animal.angle=Math.atan2(target.y-animal.y,target.x-animal.x);if(d>54){animal.x=clamp(animal.x+Math.cos(animal.angle)*95*dt,20,WORLD_W-20);animal.y=clamp(animal.y+Math.sin(animal.angle)*95*dt,20,WORLD_H-20)}else if(animal.cooldown<=0&&target.id!==animal.owner){target.hp-=animal.level===2?24:12;animal.cooldown=1.1;if(target.hp<=0){target.dead=true;target.respawn=5}}}else if(!animal.sleep){animal.x+=Math.cos(animal.angle)*22*dt;animal.y+=Math.sin(animal.angle)*22*dt;if(Math.random()<dt*.25)animal.angle+=Math.random()*2-1}if(animal.owner){animal.xp+=dt*2;const needed=(animal.level+1)*45;if(animal.level<2&&animal.xp>=needed){animal.xp=0;animal.level++;animal.max+=35;animal.hp=animal.max;this.event(`${this.world.players[animal.owner]?.name || 'A tamer'} raised a ${['baby','adult','elder'][animal.level]} ${animal.species}`)}}}}
  updateStructures(dt){for(const structure of this.world.structures){structure.cooldown=Math.max(0,(structure.cooldown||0)-dt);if(structure.type==='turret'&&structure.cooldown<=0){const owner=this.world.players[structure.owner],enemy=Object.values(this.world.players).filter(p=>p.id!==structure.owner&&!p.dead&&distance(p,structure)<280).sort((a,b)=>distance(a,structure)-distance(b,structure))[0];if(enemy){enemy.hp-=14;structure.cooldown=1;if(enemy.hp<=0&&owner)this.defeat(owner,enemy)}}if(structure.type==='spike'){for(const enemy of Object.values(this.world.players).filter(p=>p.id!==structure.owner&&!p.dead&&distance(p,structure)<34)){enemy.hp-=20*dt;if(enemy.hp<=0&&this.world.players[structure.owner])this.defeat(this.world.players[structure.owner],enemy)}}}this.world.structures=this.world.structures.filter(s=>s.hp>0)}
  updateResources(dt){for(const node of this.world.resources)if(node.hp<=0){node.respawn-=dt;if(node.respawn<=0)node.hp=node.max}}
  respawn(player){player.dead=false;player.hp=player.maxHp;player.x=200+Math.random()*(WORLD_W-400);player.y=200+Math.random()*(WORLD_H-400);player.resources.wood=Math.max(10,Math.floor(player.resources.wood*.6));player.resources.stone=Math.floor(player.resources.stone*.6);player.resources.gold=Math.floor(player.resources.gold*.5)}
}
