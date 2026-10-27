import { SEASONS, PETS, PET_BY_ID, ITEMS as ITEM_CATALOG, STARTING_ITEMS, getAgeChoices, getSeasonTiming } from './data.js';
import { NetStats, sendNetLog, coloOf } from './netstats.js';
import { REGIONS, playerWhere, withWhere, whereOf, chooseRegion, newShard, shardRegion, roomStub, regionOfColo } from './netplace.js';
import { verifyDevPass } from './netdev.js';

const WORLD_W = 3200, WORLD_H = 2400;
const TICK_MS = 50, SNAPSHOT_MS = 100, ROOM_TTL = 45 * 60_000;
const ADOPT_WAIT_MS = 6000, MOVE_CLOSE_MS = 1000; // a moved room waits this long for its players; the old one closes their sockets after this
const COLORS = ['#f0c95d','#79a966','#d96f59','#6fa8a4','#977ab2','#d99555','#7b93c5','#b66c85','#8f9e55','#c7794f','#648a91','#bc8b55','#7d77a0','#75a16f','#c06b6b','#8e9365'];
const BOT_NAMES = ['Fern','Kestrel','Mochi','Bramble','Juniper','Pip','Rowan','Clover','Wren','Taro','Mallow','Ash'];
const ITEM_BY_ID = new Map(ITEM_CATALOG.map(item => [item.id, item]));
const encoder = new TextEncoder();
const DEV_HOST = 'wildbound.andrenijman.com'; // dev passes (netdev.js) are only valid for this host

function cleanName(value, fallback = 'Wanderer', max = 16) {
  const name = String(value || '').replace(/[^a-z0-9 _-]/gi, '').replace(/\s+/g, ' ').trim().slice(0, max);
  return name || fallback;
}
function roomKey(value) { return cleanName(value, '', 24).toLowerCase(); }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function norm(x, y) { const length = Math.hypot(x, y) || 1; return { x:x/length, y:y/length }; }
function angleDiff(a, b) { return Math.atan2(Math.sin(b-a), Math.cos(b-a)); }
function structureBlocksPlayer(structure,player,x,y){
  if(structure.type!=='wall'&&structure.type!=='door')return false;if(structure.type==='door'&&structure.owner===player.id)return false;
  const angle=-(structure.rotation||0),dx=x-structure.x,dy=y-structure.y,localX=dx*Math.cos(angle)-dy*Math.sin(angle),localY=dx*Math.sin(angle)+dy*Math.cos(angle),nearestX=clamp(localX,-33,33),nearestY=clamp(localY,-13,13);return (localX-nearestX)**2+(localY-nearestY)**2<19**2;
}
function json(data, status = 200) { return Response.json(data, { status, headers:{ 'Access-Control-Allow-Origin':'*', 'Cache-Control':'no-store' } }); }
async function hash(value) { const bytes = await crypto.subtle.digest('SHA-256', encoder.encode(String(value || '').slice(0, 40))); return [...new Uint8Array(bytes)].map(v=>v.toString(16).padStart(2,'0')).join(''); }
// A client's netprobe.js results ({ weur: 38, apac: 290 }), known regions only, or null.
function cleanProbes(ms) { if (!ms || typeof ms !== 'object') return null; const out = {}; for (const region of REGIONS) { const value = Number(ms[region]); if (value > 0 && value < 10000) out[region] = Math.round(value); } return Object.keys(out).length ? out : null; }
const median = values => values.length ? [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] : null;
function newTicket() { return [...crypto.getRandomValues(new Uint8Array(16))].map(b => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join(''); }
function rng(seed) { return () => ((seed = Math.imul(seed ^ seed >>> 15, 1 | seed), seed ^= seed + Math.imul(seed ^ seed >>> 7, 61 | seed)), ((seed ^ seed >>> 14) >>> 0) / 4294967296); }

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers:{ 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Methods':'GET,OPTIONS', 'Access-Control-Allow-Headers':'Content-Type' } });
    if (url.pathname === '/health') return json({ ok:true });
    if (url.pathname === '/lobbies') return env.REGISTRY.getByName('global').fetch(new Request('https://registry/list'));
    // Only a room's socket and its /ping are forwarded; the rooms' internal routes (/_adopt, /_released) never are.
    if (url.pathname !== '/ping' && (url.pathname !== '/ws' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket')) return new Response('Wildbound relay', { status:404 });
    const key = roomKey(url.searchParams.get('room')), shard = url.searchParams.get('shard') || '';
    if (key.length < 3) return new Response('invalid lobby name', { status:400 });
    if (shard && !shardRegion(shard)) return new Response('invalid shard', { status:400 });
    // A moved room lives on a shard (netplace.js); where the player connects from rides along for the lag log.
    return roomStub(env.ROOMS, key, shard).fetch(withWhere(request, playerWhere(request)));
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
  const roster=PETS.filter(pet=>pet.season==='forest');
  for(let i=0;i<40;i++){const pet=roster[i%roster.length],baby=i%3!==0,hp=baby?Math.round(pet.baseStats.hp*.58):pet.baseStats.hp;animals.push({id:`a${i}`,species:pet.id,x:120+random()*(WORLD_W-240),y:120+random()*(WORLD_H-240),hp,max:hp,baby,sleep:baby,owner:null,level:0,xp:0,angle:random()*Math.PI*2,cooldown:0,respawn:0})}
  animals.push(makeBoss(SEASONS[0],random));
  return {seed,time:0,season:0,biome:SEASONS[0].name,day:1,players:{},resources,animals,structures:[],projectiles:[]};
}
function makeBoss(season,random=Math.random){return{id:'boss',species:season.bossId,boss:true,season:season.id,x:500+random()*(WORLD_W-1000),y:500+random()*(WORLD_H-1000),hp:1600,max:1600,baby:false,sleep:false,owner:null,level:2,xp:0,angle:0,cooldown:0,respawn:0}}
function newPlayer(id,name,x,y,color,bot=false){return{id,name,x,y,angle:0,color,hp:100,maxHp:100,xp:0,age:0,nextXp:40,resources:{wood:20,stone:10,food:25,gold:0},selected:0,loadout:[...STARTING_ITEMS],unlocks:[...STARTING_ITEMS],choiceAge:null,cooldown:0,actionAt:-99,actionKind:'',actionItem:'',dead:false,kills:0,pets:[],bot,respawn:0,target:null,input:{x:0,y:0,angle:0,rotation:0,attack:false,interact:false,selected:0},brain:0,goal:null};}
function publicPlayer(player){const copy={...player};delete copy.input;delete copy.brain;delete copy.goal;return copy;}

export class GameRoom {
  constructor(ctx, env) {
    this.ctx=ctx;this.env=env;this.sessions=new Map();this.players=new Map();this.room='';this.key='';this.host=null;this.settings={max:8,bots:4};this.password='';this.started=false;this.world=null;this.nextId=1;this.timer=null;this.lastTick=0;this.lastSnapshot=0;this.touched=Date.now();
    this.net=null;this.netLoopAt=0;this.netBots=0;this.colo='';this.coloP=null; // lag stats for the expedition in progress
    // Placement (netplace.js): moved is the shard this room moved to (persisted; undefined until loaded), moving the move in flight;
    // a shard knows its shard, the colo it came from, and the tickets of the players still to reconnect.
    this.moved=undefined;this.moving=null;this.adopted=false;this.shard='';this.movedFrom='';this.tickets=null;this.adoptTimer=null;
  }
  async fetch(request){
    const url=new URL(request.url);
    if(url.pathname==='/ping'){const colo=await this.whereColo();return json({colo,region:regionOfColo(colo)})}
    if(url.pathname==='/_adopt'&&request.method==='POST')return this.adopt(await request.json());
    if(url.pathname==='/_alive')return json({alive:!!(this.room||this.players.size||this.tickets)});
    if(url.pathname==='/_released'&&request.method==='POST'){const {shard}=await request.json();await this.loadMoved();if(this.moved&&this.moved===shard)await this.clearMoved();return new Response(null,{status:204})}
    if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return new Response('upgrade required',{status:426});
    await this.loadMoved();
    const pair=new WebSocketPair(),client=pair[0],server=pair[1];server.accept();
    const session={socket:server,id:null,ready:false,where:whereOf(request),ticket:url.searchParams.get('ticket')||'',regions:null,rtts:[]};this.sessions.set(server,session);this.touched=Date.now();
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
    if(!session.ready){await this.join(session,message);return}if(this.moved)return;const player=this.players.get(session.id);if(!player)return;
    if(message.t==='start'){if(session.id===this.host&&!this.started&&!this.tickets)await this.startOrMove();return}
    if(message.t==='regions'){session.regions=cleanProbes(message.ms);return}
    if(message.t==='ping'){if(typeof message.rtt==='number'&&message.rtt>=0&&message.rtt<60000){const rtts=session.rtts??=[];rtts.push(message.rtt);if(rtts.length>5)rtts.shift()}this.net?.ping(session.id,message.rtt,message.fps,message.frameMax);this.send(session.socket,{t:'pong',c:message.c});return}
    if(message.t==='input'&&this.started){this.net?.message(session.id);player.input={x:clamp(Number(message.x)||0,-1,1),y:clamp(Number(message.y)||0,-1,1),angle:Number.isFinite(message.angle)?message.angle:player.angle,rotation:Number.isFinite(message.rotation)?message.rotation:player.angle+Math.PI/2,attack:!!message.attack,interact:!!message.interact,selected:clamp(Math.floor(Number(message.selected)||0),0,player.loadout.length-1)};return}
    if(message.t==='eat'&&this.started&&!player.dead&&player.hp<player.maxHp){const food=ITEM_BY_ID.get(player.loadout.find(id=>ITEM_BY_ID.get(id)?.slot==='food')),cost=food?.stats.foodUse||5;if(player.resources.food>=cost){player.resources.food-=cost;player.hp=Math.min(player.maxHp,player.hp+(food?.stats.healing||10))}return}
    if(message.t==='choose'&&this.started&&player.choiceAge!==null){const item=ITEM_BY_ID.get(String(message.id||'')),choices=this.getAgeChoiceIds(player,player.choiceAge);if(item&&choices.includes(item.id))this.applyChoice(player,item);return}
    if(message.t==='skill'&&this.started){this.usePetSkill(player,clamp(Math.floor(message.slot||0),0,2));return}
    if(message.t==='respawn'&&this.started&&player.dead&&player.respawn<=0){this.respawn(player);return}
    if(message.t==='chat'){const text=String(message.message||'').replace(/[^\x20-\x7e]/g,'').trim().slice(0,100);if(text)this.broadcast({t:'chat',name:player.name,message:text});}
  }
  async join(session,message){
    if(!['create','join'].includes(message.t)){this.send(session.socket,{t:'error',message:'Create or join first'});session.socket.close(1008);return}
    if(this.moving)await this.moving;if(this.moved&&!await this.shardAlive(roomKey(message.room)))await this.clearMoved();if(this.moved){this.redirect(session);return}
    const seat=session.ticket&&this.tickets?.get(session.ticket);
    if(seat){this.tickets.delete(session.ticket);this.seatPlayer(session,seat.id,seat.name,seat.color);if(!this.tickets.size)this.startAdopted();return}
    const requested=cleanName(message.room,'',24),key=roomKey(requested);if(key.length<3){this.reject(session,'Invalid lobby name');return}
    // A dev (a valid games-guard pass in message.dev) joins past the password, the player limit and a running expedition; anything else is an ordinary player.
    const dev=await verifyDevPass(message.dev,DEV_HOST,{publicKey:this.env.DEV_TEST_PUBLIC_KEY||undefined});
    if(message.t==='create'){
      if(this.room||this.players.size){this.reject(session,'A lobby with that name already exists');return}
      this.room=requested;this.key=key;this.settings={max:clamp(Math.round(message.settings?.max||8),2,16),bots:clamp(Math.round(message.settings?.bots||0),0,8)};this.settings.bots=Math.min(this.settings.bots,this.settings.max-1);this.password=await hash(message.password||'');
    }else{
      if(!this.room){this.reject(session,'No open lobby has that name');return}
      if(!dev){
        if(this.started){this.reject(session,'That expedition has already started');return}
        if(this.players.size>=this.settings.max){this.reject(session,'That lobby is full');return}
        if(this.password!==await hash(message.password||'')){this.reject(session,'Wrong lobby password');return}
      }
    }
    const id=`p${this.nextId++}`,name=cleanName(message.name),color=COLORS[(this.nextId-2)%COLORS.length];
    if(this.started&&this.world)this.seatLate(session,id,name,color);else this.seatPlayer(session,id,name,color);
    if(dev)this.broadcast({t:'dev-joined',name:dev.name});
    await this.syncRegistry();
  }
  seatPlayer(session,id,name,color){const player=newPlayer(id,name,0,0,color);this.players.set(id,player);session.id=id;session.ready=true;if(!this.host)this.host=id;this.send(session.socket,{t:'welcome',id,host:id===this.host});this.sendLobby()}
  // Only a dev gets into a running expedition: a fresh tamer dropped somewhere on the range, as a respawn would be,
  // and an ordinary seat in the lag log. The range keeps its population: when tamers would now outnumber the
  // lobby's max, one roaming tamer (bot) leaves and its pets go wild. Everyone else is playing, so no lobby message.
  seatLate(session,id,name,color){
    const player=newPlayer(id,name,200+Math.random()*(WORLD_W-400),200+Math.random()*(WORLD_H-400),color);this.players.set(id,player);this.world.players[id]=player;session.id=id;session.ready=true;
    const bots=Object.values(this.world.players).filter(p=>p.bot);
    if(bots.length&&Object.keys(this.world.players).length>this.settings.max){const bot=bots[bots.length-1];delete this.world.players[bot.id];this.netBots=Math.max(0,this.netBots-1);for(const animal of this.world.animals)if(animal.owner===bot.id)animal.owner=null;this.event(`${bot.name} left the range to make room for ${name}`)}
    this.net?.seat(id,name,session.where);
    this.send(session.socket,{t:'welcome',id,host:false});this.send(session.socket,{t:'start',you:id,world:this.serializedWorld()});
  }
  reject(session,message){this.send(session.socket,{t:'error',message});setTimeout(()=>session.socket.close(1008,message),20)}
  remove(session){
    this.sessions.delete(session.socket);if(!session.id){if(!this.sessions.size&&!this.players.size&&!this.tickets)this.stopTimer();return}const wasHost=session.id===this.host;this.players.delete(session.id);if(this.world)delete this.world.players[session.id];
    if(!this.players.size){this.reset();return}if(this.moved)return;if(wasHost)this.host=this.players.keys().next().value;this.sendLobby();this.syncRegistry();
  }
  reset(){this.endNetLog('closed');this.removeRegistry();this.release();this.room='';this.key='';this.host=null;this.players.clear();this.started=false;this.world=null;this.password='';this.tickets=null;clearTimeout(this.adoptTimer);this.stopTimer()}
  stopTimer(){if(this.timer){clearInterval(this.timer);this.timer=null}}
  sendLobby(){this.broadcast({t:'lobby',name:this.room,host:this.host,settings:this.settings,players:[...this.players.values()].map(p=>({id:p.id,name:p.name,color:p.color}))});}
  async syncRegistry(){if(!this.key||this.moved||this.tickets)return;const lobby={name:this.room,key:this.key,players:this.players.size,max:this.settings.max,locked:!!this.password,started:this.started,biome:this.world?.biome||'Forest',updated:Date.now()};await this.env.REGISTRY.getByName('global').fetch(new Request('https://registry/upsert',{method:'POST',body:JSON.stringify({key:this.key,lobby})}));}
  async removeRegistry(){if(!this.key)return;await this.env.REGISTRY.getByName('global').fetch(new Request('https://registry/remove',{method:'POST',body:JSON.stringify({key:this.key})}));}

  // Placement, at match start: a mixed group whose worst ping would clearly improve elsewhere
  // (chooseRegion) moves first to a fresh Durable Object in that region, once; otherwise, or if
  // the move fails, the expedition starts here as before.
  async startOrMove(){
    if(this.moving)return;const sessions=[...this.sessions.values()].filter(s=>s.ready&&this.players.has(s.id));
    const choice=!this.adopted&&sessions.length>=2?chooseRegion(sessions.map(s=>({probes:s.regions,rtt:median(s.rtts||[])}))):null;
    if(choice){this.moving=this.move(choice.region,sessions);await this.moving;this.moving=null}
    if(!this.moved)this.start();
  }
  async move(region,sessions){
    const shard=newShard(region),tickets={},state={room:this.room,settings:this.settings,password:this.password,host:this.host,nextId:this.nextId},ticketOf=new Map();
    for(const session of sessions){const ticket=newTicket(),player=this.players.get(session.id);tickets[ticket]={id:player.id,name:player.name,color:player.color};ticketOf.set(session,ticket)}
    try{const response=await roomStub(this.env.ROOMS,this.key,shard).fetch(new Request('https://room/_adopt',{method:'POST',body:JSON.stringify({code:this.key,shard,from:await this.whereColo(),state,tickets})}));if(!response.ok)throw new Error(`adopt answered ${response.status}`)}
    catch(error){console.error('room move failed, starting here',error);return}
    this.moved=shard;this.ctx.storage?.put('moved',shard);this.removeRegistry();for(const [session,ticket] of ticketOf)this.redirect(session,ticket);
  }
  // Send a socket on to the shard (a ticket keeps its seat; without one it joins as anyone would), then close it.
  redirect(session,ticket){this.send(session.socket,{t:'move',shard:this.moved,region:shardRegion(this.moved),...(ticket?{ticket}:{})});setTimeout(()=>session.socket.close(4000,'moved'),MOVE_CLOSE_MS)}
  // On the shard: the old room's state and a ticket per player. Starts when every ticket is back, or after ADOPT_WAIT_MS with whoever made it.
  adopt({code,shard,from,state,tickets}){
    if(this.room||this.players.size||!state||!shardRegion(shard))return new Response('room busy',{status:409});
    this.adopted=true;this.key=code;this.shard=shard;this.movedFrom=String(from||'');this.room=state.room;this.settings=state.settings;this.password=state.password;this.host=state.host;this.nextId=state.nextId;
    this.tickets=new Map(Object.entries(tickets||{}));this.touched=Date.now();this.adoptTimer=setTimeout(()=>this.startAdopted(),ADOPT_WAIT_MS);this.whereColo();return new Response(null,{status:204});
  }
  startAdopted(){clearTimeout(this.adoptTimer);this.adoptTimer=null;if(!this.tickets)return;this.tickets=null;if(!this.players.size){this.reset();return}if(!this.players.has(this.host))this.host=this.players.keys().next().value;this.start()}
  // When a shard empties, its room's name is free again at the original Durable Object.
  release(){if(!this.shard)return;const shard=this.shard;this.shard='';this.movedFrom='';const done=roomStub(this.env.ROOMS,this.key).fetch(new Request('https://room/_released',{method:'POST',body:JSON.stringify({shard})})).catch(error=>console.error('room release failed',error));this.ctx.waitUntil?.(done)}
  // A shard that lost its room without releasing the name (a restart mid-expedition) must not hold it forever.
  async shardAlive(code){try{const response=await roomStub(this.env.ROOMS,code,this.moved).fetch(new Request('https://room/_alive'));return !response.ok||(await response.json()).alive}catch{return true}}
  async clearMoved(){this.moved=null;await this.ctx.storage?.delete('moved')}
  async loadMoved(){if(this.moved===undefined)this.moved=(await this.ctx.storage?.get('moved'))||null}
  whereColo(){return this.coloP??=this.colo?Promise.resolve(this.colo):coloOf().then(colo=>{this.colo=colo;if(!colo)this.coloP=null;return colo})}
  sessionOf(id){for(const session of this.sessions.values())if(session.id===id)return session;return null}

  start(){
    this.started=true;this.world=createWorld(Date.now());let index=0;
    for(const player of this.players.values()){Object.assign(player,newPlayer(player.id,player.name,500+index*55,WORLD_H/2+(index%2)*70,player.color));player.bot=false;this.world.players[player.id]=player;index++}
    for(let i=0;i<this.settings.bots&&this.players.size+i<this.settings.max;i++){const id=`b${i}`,bot=newPlayer(id,BOT_NAMES[i%BOT_NAMES.length],300+Math.random()*(WORLD_W-600),300+Math.random()*(WORLD_H-600),COLORS[(index+i)%COLORS.length],true);this.world.players[id]=bot;}
    this.removeRegistry();for(const session of this.sessions.values())if(session.ready)this.send(session.socket,{t:'start',you:session.id,world:this.serializedWorld()});this.lastTick=Date.now();this.startNetLog();
  }
  // One lag record per expedition, from the host's start until the room empties
  // (only a dev can join a started expedition), sent to games-guard's NetLog.
  startNetLog(){this.endNetLog('abandoned');this.net=new NetStats();this.netLoopAt=0;for(const player of this.players.values())this.net.seat(player.id,player.name,this.sessionOf(player.id)?.where);this.netBots=Object.values(this.world.players).filter(p=>p.bot).length;this.whereColo()}
  endNetLog(outcome){const net=this.net;this.net=null;if(!net)return;const record=net.record({code:this.room,mode:`${net.seats.size}p + ${this.netBots} bots · survival`,outcome,colo:this.colo,region:shardRegion(this.shard)||regionOfColo(this.colo),moved:this.shard?{from:this.movedFrom,to:shardRegion(this.shard)}:null});if(record.runTime<10)return;sendNetLog(this.env,this.ctx,'wildbound',record)}
  ensureTimer(){if(this.timer)return;this.timer=setInterval(()=>this.tick(),TICK_MS)}
  tick(){
    const now=Date.now();if(now-this.touched>ROOM_TTL){for(const session of this.sessions.values())session.socket.close(1000,'lobby idle');this.reset();return}if(!this.started||!this.world){return}
    const gap=now-this.lastTick,dt=Math.min(.1,gap/1000||.05);this.lastTick=now;if(this.net){if(this.netLoopAt)this.net.loop(gap,dt*1000,Math.max(0,gap-100));this.netLoopAt=now}this.world.time+=dt;this.world.day=1+Math.floor(this.world.time/180);const timing=getSeasonTiming(this.world.time),nextSeason=timing.index;if(nextSeason!==this.world.season){this.world.season=nextSeason;this.world.biome=SEASONS[nextSeason].name;const boss=this.world.animals.find(animal=>animal.boss);if(boss)Object.assign(boss,makeBoss(SEASONS[nextSeason]));this.event(`${this.world.biome} has reached the range`)}
    for(const player of Object.values(this.world.players)){player.cooldown=Math.max(0,player.cooldown-dt);if(player.dead){player.respawn=Math.max(0,player.respawn-dt);if(player.bot&&player.respawn<=0)this.respawn(player);continue}if(player.bot)this.updateBot(player,dt);else this.applyInput(player,dt)}
    this.updateAnimals(dt);this.updateStructures(dt);this.updateResources(dt);
    if(now-this.lastSnapshot>=SNAPSHOT_MS){this.lastSnapshot=now;this.broadcast({t:'snapshot',world:this.serializedWorld()})}
    if(Math.floor(now/15000)!==Math.floor((now-TICK_MS)/15000))this.syncRegistry();
  }
  serializedWorld(){return{seed:this.world.seed,time:this.world.time,season:this.world.season,biome:this.world.biome,day:this.world.day,players:Object.fromEntries(Object.entries(this.world.players).map(([id,p])=>[id,publicPlayer(p)])),resources:this.world.resources,animals:this.world.animals,structures:this.world.structures,projectiles:[]}}
  applyInput(player,dt){const input=player.input,direction=norm(input.x,input.y),moving=Math.abs(input.x)+Math.abs(input.y)>.05;if(moving){const nextX=clamp(player.x+direction.x*175*dt,24,WORLD_W-24);if(!this.world.structures.some(structure=>structureBlocksPlayer(structure,player,nextX,player.y)))player.x=nextX;const nextY=clamp(player.y+direction.y*175*dt,24,WORLD_H-24);if(!this.world.structures.some(structure=>structureBlocksPlayer(structure,player,player.x,nextY)))player.y=nextY}player.angle=input.angle;player.selected=input.selected;if(input.attack&&player.cooldown<=0)this.performAction(player);if(input.interact){this.tameNearest(player);input.interact=false}}
  getAgeChoiceIds(player,age){return getAgeChoices(age,player.loadout)}
  applyChoice(player,item){if(!player.unlocks.includes(item.id))player.unlocks.push(item.id);const existing=player.loadout.findIndex(id=>ITEM_BY_ID.get(id)?.slot===item.slot);if(existing>=0)player.loadout[existing]=item.id;else player.loadout.push(item.id);player.selected=clamp(player.selected,0,player.loadout.length-1);player.choiceAge=null}
  gainXp(player,amount){player.xp+=amount;while(player.xp>=player.nextXp){player.xp-=player.nextXp;player.age++;player.nextXp=40*(player.age+1);player.maxHp+=5;player.hp=player.maxHp;player.choiceAge=Math.min(27,player.age);if(player.bot){const choices=this.getAgeChoiceIds(player,player.choiceAge),item=ITEM_BY_ID.get(choices[Math.floor(Math.random()*choices.length)]);if(item)this.applyChoice(player,item);else player.choiceAge=null}this.event(`${player.name} reached age ${player.age}`,player.id)}}
  performAction(player){
    const selectedId=player.bot?player.loadout?.find(id=>ITEM_BY_ID.get(id)?.slot==='primary'):player.loadout?.[player.selected],item=ITEM_BY_ID.get(selectedId)||ITEM_BY_ID.get('hand');if(!player.unlocks?.includes(item.id)){player.cooldown=.3;return}player.actionAt=this.world.time;player.actionItem=item.id;player.actionKind=item.category==='building'?'build':item.category==='ranged'?'shoot':item.branch==='wrench'?'repair':'swing';if(item.category==='building'){this.placeStructure(player,item);return}
    const stats=item.stats||{};player.cooldown=stats.cooldown||.48;const range=stats.range||72,damage=stats.damage||stats.power||18;
    if(item.branch==='wrench'){const structure=this.world.structures.filter(s=>s.owner===player.id&&s.hp<s.max&&distance(player,s)<range).sort((a,b)=>distance(player,a)-distance(player,b))[0];if(structure&&player.resources.stone>0){player.resources.stone--;structure.hp=Math.min(structure.max,structure.hp+(stats.repair||20))}return}
    let targets=[...this.world.resources.filter(r=>r.hp>0),...this.world.animals.filter(a=>a.hp>0&&a.owner!==player.id),...Object.values(this.world.players).filter(p=>p.id!==player.id&&!p.dead),...this.world.structures.filter(s=>s.owner!==player.id)];
    const aimError=target=>Math.abs(angleDiff(player.angle,Math.atan2(target.y-player.y,target.x-player.x)));targets=targets.filter(target=>distance(player,target)<range&&aimError(target)<(item.category==='ranged'?.2:.7)).sort((a,b)=>aimError(a)-aimError(b)||distance(player,a)-distance(player,b));const target=targets[0];if(!target)return;player.target=target.id;
    if(target.id.startsWith('r'))this.harvest(player,target,stats.power||10);else{target.hp-=damage;target.hitAt=this.world.time;if(target.hp<=0)this.defeat(player,target)}
  }
  harvest(player,node,amount){if(node.hp<=0)return;node.hp-=amount;const yields=node.type==='tree'?['wood',4]:node.type==='rock'?['stone',3]:node.type==='berry'?['food',2]:['gold',2];player.resources[yields[0]]+=yields[1];this.gainXp(player,4);if(node.hp<=0){node.respawn=25+Math.random()*20;this.gainXp(player,18)}}
  defeat(killer,target){target.hp=0;this.gainXp(killer,target.boss?400:target.baby?50:100);killer.resources.food+=target.boss?40:2;if(target.boss){killer.resources.gold+=180;target.respawn=45;const roster=PETS.filter(p=>p.season===SEASONS[this.world.season||0].id&&['epic','legendary','rare'].includes(p.rarity));for(let i=0;i<3;i++){const pet=roster[i%roster.length],hp=Math.round(pet.baseStats.hp*.58);this.world.animals.push({id:`reward-${crypto.randomUUID()}`,species:pet.id,x:target.x+(i-1)*55,y:target.y+65,hp,max:hp,baby:true,sleep:true,owner:null,level:0,xp:0,angle:0,cooldown:0,respawn:0})}this.event(`${killer.name} defeated ${target.species.replaceAll('-',' ')}`);return}if(target.id in this.world.players){target.dead=true;target.respawn=5;killer.kills++;this.event(`${killer.name} defeated ${target.name}`)}else target.respawn=20}
  placeStructure(player,item){const cost=item.cost||{};if(!Object.entries(cost).every(([k,v])=>player.resources[k]>=v)){player.cooldown=.3;return}const x=player.x+Math.cos(player.angle)*72,y=player.y+Math.sin(player.angle)*72;if(this.world.structures.some(s=>Math.hypot(s.x-x,s.y-y)<52))return;Object.entries(cost).forEach(([k,v])=>player.resources[k]-=v);const kind=['wall','door','spike','windmill'].includes(item.slot)?item.slot:item.stats.healing?'healer':item.stats.boost?'boost':'turret',hp=item.stats.health||160,rotation=player.bot?player.angle+Math.PI/2:player.input.rotation;this.world.structures.push({id:`s${crypto.randomUUID()}`,type:kind,item:item.id,x,y,rotation,owner:player.id,hp,max:hp,cooldown:0,damage:item.stats.damage||0,range:item.stats.range||0,income:item.stats.income||0,healing:item.stats.healing||0});player.cooldown=.4}
  tameNearest(player){const owned=this.world.animals.filter(a=>a.owner===player.id);if(owned.length>=3)return;const pet=this.world.animals.filter(a=>a.baby&&a.sleep&&!a.owner&&a.hp>0&&distance(a,player)<80).sort((a,b)=>distance(a,player)-distance(b,player))[0];if(!pet)return;if(Math.random()<.76){const def=PET_BY_ID.get(pet.species);pet.owner=player.id;pet.sleep=false;pet.hp=pet.max=Math.round((def?.baseStats.hp||100)*.7);player.pets.push(pet.id);this.event(`${player.name} befriended a ${def?.name||pet.species}`,player.id)}else{pet.sleep=false;this.event('The animal woke up startled',player.id)}}
  usePetSkill(player,slot){const pets=this.world.animals.filter(animal=>animal.owner===player.id),pet=pets[slot];if(!pet||pet.skillCooldown>0)return;const def=PET_BY_ID.get(pet.species);if(!def)return;pet.skillCooldown=8;if(/mend|help|spring|shield|guard|ward/.test(def.skill)){player.hp=Math.min(player.maxHp,player.hp+30);pet.hp=Math.min(pet.max,pet.hp+30)}else{const enemy=Object.values(this.world.players).filter(other=>other.id!==player.id&&!other.dead&&distance(other,pet)<260).sort((a,b)=>distance(a,pet)-distance(b,pet))[0];if(enemy){enemy.hp-=def.baseStats.attack*2;if(enemy.hp<=0)this.defeat(player,enemy)}}this.event(`${def.name} used ${def.skill.replaceAll('-',' ')}`,player.id)}
  updateBot(bot,dt){bot.brain-=dt;if(bot.brain<=0){bot.brain=.35+Math.random()*.5;const threats=Object.values(this.world.players).filter(p=>p.id!==bot.id&&!p.dead&&distance(p,bot)<240),node=this.world.resources.filter(r=>r.hp>0).sort((a,b)=>distance(a,bot)-distance(b,bot))[0],baby=this.world.animals.find(a=>a.baby&&a.sleep&&!a.owner&&distance(a,bot)<100);if(baby&&Math.random()<.35)this.tameNearest(bot);bot.goal=threats[0]||node;if(bot.age>=2&&Math.random()<.08){bot.selected=3+Math.floor(Math.random()*Math.min(3,Math.max(1,bot.age-1)));this.performAction(bot)}}if(!bot.goal)return;const d=distance(bot,bot.goal);bot.angle=Math.atan2(bot.goal.y-bot.y,bot.goal.x-bot.x);if(d>65){bot.x=clamp(bot.x+Math.cos(bot.angle)*145*dt,24,WORLD_W-24);bot.y=clamp(bot.y+Math.sin(bot.angle)*145*dt,24,WORLD_H-24)}else if(bot.cooldown<=0){bot.selected=bot.goal.name?1:0;this.performAction(bot)}}
  updateAnimals(dt){
    for(const animal of this.world.animals){
      animal.cooldown=Math.max(0,(animal.cooldown||0)-dt);animal.skillCooldown=Math.max(0,(animal.skillCooldown||0)-dt);
      if(animal.hp<=0){animal.respawn-=dt;if(animal.respawn<=0){if(animal.boss){Object.assign(animal,makeBoss(SEASONS[this.world.season||0]))}else{const roster=PETS.filter(pet=>pet.season===SEASONS[this.world.season||0].id),pet=roster[Math.floor(Math.random()*roster.length)];animal.species=pet.id;animal.max=animal.baby?Math.round(pet.baseStats.hp*.58):pet.baseStats.hp;animal.hp=animal.max;animal.owner=null;animal.sleep=animal.baby;animal.x=100+Math.random()*(WORLD_W-200);animal.y=100+Math.random()*(WORLD_H-200)}}continue}
      let target=null;if(animal.owner){target=this.world.players[animal.owner];const enemy=Object.values(this.world.players).filter(p=>p.id!==animal.owner&&!p.dead&&distance(p,animal)<210).sort((a,b)=>distance(a,animal)-distance(b,animal))[0];if(enemy)target=enemy}else if(!animal.baby&&!animal.sleep){target=Object.values(this.world.players).filter(p=>!p.dead).sort((a,b)=>distance(a,animal)-distance(b,animal))[0];if(target&&distance(target,animal)>(animal.boss?330:190))target=null}
      if(target){const d=distance(animal,target);animal.angle=Math.atan2(target.y-animal.y,target.x-animal.x);if(d>(animal.boss?78:54)){if(!animal.boss){animal.x=clamp(animal.x+Math.cos(animal.angle)*95*dt,20,WORLD_W-20);animal.y=clamp(animal.y+Math.sin(animal.angle)*95*dt,20,WORLD_H-20)}}else if(animal.cooldown<=0&&target.id!==animal.owner){target.hp-=animal.boss?38:animal.level===2?24:12;animal.cooldown=animal.boss?1.6:1.1;if(target.hp<=0){target.dead=true;target.respawn=5}}}else if(!animal.sleep&&!animal.boss){animal.x+=Math.cos(animal.angle)*22*dt;animal.y+=Math.sin(animal.angle)*22*dt;if(Math.random()<dt*.25)animal.angle+=Math.random()*2-1}
      if(animal.owner){animal.xp+=dt*2;const needed=(animal.level+1)*45;if(animal.level<2&&animal.xp>=needed){animal.xp=0;animal.level++;animal.max+=35;animal.hp=animal.max;this.event(`${this.world.players[animal.owner]?.name || 'A tamer'} raised a ${['baby','adult','boss'][animal.level]} ${PET_BY_ID.get(animal.species)?.name||animal.species}`)}}
    }
  }
  updateStructures(dt){for(const structure of this.world.structures){structure.cooldown=Math.max(0,(structure.cooldown||0)-dt);const owner=this.world.players[structure.owner];if(structure.type==='turret'&&structure.cooldown<=0){const enemy=Object.values(this.world.players).filter(p=>p.id!==structure.owner&&!p.dead&&distance(p,structure)<(structure.range||280)).sort((a,b)=>distance(a,structure)-distance(b,structure))[0];if(enemy){enemy.hp-=structure.damage||14;structure.cooldown=1;if(enemy.hp<=0&&owner)this.defeat(owner,enemy)}}if(structure.type==='spike')for(const enemy of Object.values(this.world.players).filter(p=>p.id!==structure.owner&&!p.dead&&distance(p,structure)<34)){enemy.hp-=(structure.damage||20)*dt;if(enemy.hp<=0&&owner)this.defeat(owner,enemy)}if(structure.type==='windmill'&&owner){structure.incomeClock=(structure.incomeClock||0)+dt;if(structure.incomeClock>=5){owner.resources.gold+=(structure.income||1);structure.incomeClock-=5}}if(structure.type==='healer'&&owner&&distance(owner,structure)<110)owner.hp=Math.min(owner.maxHp,owner.hp+(structure.healing||2)*dt)}this.world.structures=this.world.structures.filter(s=>s.hp>0)}
  updateResources(dt){for(const node of this.world.resources)if(node.hp<=0){node.respawn-=dt;if(node.respawn<=0)node.hp=node.max}}
  respawn(player){player.dead=false;player.hp=player.maxHp;player.x=200+Math.random()*(WORLD_W-400);player.y=200+Math.random()*(WORLD_H-400);player.resources.wood=Math.max(10,Math.floor(player.resources.wood*.6));player.resources.stone=Math.floor(player.resources.stone*.6);player.resources.gold=Math.floor(player.resources.gold*.5)}
}
