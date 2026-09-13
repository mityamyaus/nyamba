'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
function normalizePhone(raw){if(typeof raw!=='string'||raw.length>30)throw Error('Введите российский номер телефона.');let p=raw.replace(/[\s()+-]/g,'');if(p.startsWith('8')&&p.length===11)p='7'+p.slice(1);if(!/^79\d{9}$/.test(p))throw Error('Введите мобильный номер в формате +7 9XX XXX-XX-XX.');return p}
async function sendSMS(phone,code){const key=process.env.SMS_RU_API_ID;if(!key)throw Error('SMS-сервис не настроен.');const body=new URLSearchParams({api_id:key,to:phone,msg:'На неделю: код входа '+code+'. Действует 5 минут. Никому не сообщайте код.',json:'1',ttl:'5'});if(process.env.SMS_RU_SENDER)body.set('from',process.env.SMS_RU_SENDER);const r=await fetch('https://sms.ru/sms/send',{method:'POST',body,signal:AbortSignal.timeout(15000)});const j=await r.json();if(!r.ok||j.status!=='OK'||j.sms?.[phone]?.status!=='OK')throw Error('SMS-сервис не принял сообщение. Попробуйте позже.');}
function createAuthStore(dir=path.join(__dirname,'../.app-data'),options={}){let db,tail=Promise.resolve();const file=path.join(dir,'accounts.json'),attempts=new Map(),codes=new Map();const now=options.now||Date.now,pepper=crypto.randomBytes(32);const demo=options.demo??!process.env.SMS_RU_API_ID,sender=options.sendSMS||sendSMS;
 const codeHash=(phone,code)=>crypto.createHmac('sha256',pepper).update(phone+'|'+code).digest();
 async function load(){if(db)return;try{db=JSON.parse(await fs.readFile(file,'utf8'))}catch(e){if(e.code!=='ENOENT')throw Error('Не удалось прочитать аккаунты.');db={users:[],sessions:[]}}}
 async function save(){await fs.mkdir(dir,{recursive:true});await fs.writeFile(file+'.tmp',JSON.stringify(db),{mode:0o600});await fs.rename(file+'.tmp',file)}
 const serial=fn=>{const r=tail.then(fn);tail=r.catch(()=>{});return r};
 const publicUser=u=>({id:u.id,phone:u.phone,phoneVerified:u.phoneVerified===true,city:u.city||null});
 function limit(key,max){const time=now();for(const[k,v]of attempts)if(v.until<time)attempts.delete(k);const v=attempts.get(key)||{count:0,until:time+15*60*1000};v.count++;attempts.set(key,v);if(v.count>max){const e=Error('Слишком много попыток. Повторите через 15 минут.');e.status=429;throw e}}
 function find(token){if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))return null;const s=db.sessions.find(s=>s.hash===digest(token)&&s.expires>now());return s?db.users.find(u=>u.id===s.userId):null}
 return {
  demo,
  me:token=>serial(async()=>{await load();const u=find(token);return u?publicUser(u):null}),
  requestCode:(raw,key='local')=>serial(async()=>{await load();const phone=normalizePhone(raw);for(const[k,c]of codes)if(c.expires<now())codes.delete(k);const previous=[...codes.values()].find(c=>c.phone===phone);if(previous&&now()-previous.createdAt<60000)throw Error('Новый код можно запросить через минуту.');limit('send-ip:'+key,8);limit('send-phone:'+phone,3);if(demo&&db.users.some(u=>u.phone===phone&&u.phoneVerified))throw Error('Для этого аккаунта нужен настоящий SMS-сервис.');
   const code=String(crypto.randomInt(100000,1000000)),id=crypto.randomBytes(24).toString('hex');if(!demo)await sender(phone,code);for(const[k,c]of codes)if(c.phone===phone)codes.delete(k);codes.set(id,{phone,hash:codeHash(phone,code),createdAt:now(),expires:now()+300000,tries:0,demo});return{challengeId:id,phone:'+'+phone,expiresIn:300,retryAfter:60,demo,...(demo?{testCode:code}:{})};
  }),
  verify:(id,code,key='local')=>serial(async()=>{await load();limit('verify-ip:'+key,30);const c=codes.get(id);if(!c||c.expires<now()){codes.delete(id);throw Error('Код истёк. Запросите новый.')}if(typeof code!=='string'||!/^\d{6}$/.test(code))throw Error('Введите шестизначный код.');c.tries++;if(c.tries>5){codes.delete(id);throw Error('Слишком много ошибок. Запросите новый код.')}if(!crypto.timingSafeEqual(c.hash,codeHash(c.phone,code))){if(c.tries>=5)codes.delete(id);throw Error('Неверный код. Проверьте цифры.')}codes.delete(id);let u=db.users.find(u=>u.phone===c.phone);if(c.demo&&u?.phoneVerified)throw Error('Необходима проверка настоящим SMS.');if(!u){u={id:crypto.randomUUID(),phone:c.phone,phoneVerified:!c.demo,city:null,createdAt:new Date(now()).toISOString()};db.users.push(u)}else if(!c.demo){if(!u.phoneVerified)db.sessions=db.sessions.filter(s=>s.userId!==u.id);u.phoneVerified=true;}
   const token=crypto.randomBytes(32).toString('hex');db.sessions=db.sessions.filter(s=>s.expires>now());db.sessions.push({hash:digest(token),userId:u.id,expires:now()+7*86400000});await save();return{user:publicUser(u),token};
  }),
  logout:token=>serial(async()=>{await load();db.sessions=db.sessions.filter(s=>s.hash!==digest(token||''));await save();return{ok:true}}),
  city:(token,city)=>serial(async()=>{await load();const u=find(token);if(!u){const e=Error('Войдите в приложение.');e.status=401;throw e}if(!city||!Number.isInteger(city.id)||typeof city.name!=='string'||city.name.length>100||city.name.length<2||!Number.isFinite(city.lat)||!Number.isFinite(city.lon)||city.lat<-90||city.lat>90||city.lon<-180||city.lon>180)throw Error('Выберите город из результатов поиска.');u.city={id:city.id,name:city.name,region:String(city.region||'').slice(0,150),lat:city.lat,lon:city.lon};await save();return{user:publicUser(u)}})
 };
}
function readSession(cookie=''){return cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith('meal_session='))?.slice(13)||''}
module.exports={createAuthStore,readSession,normalizePhone};
