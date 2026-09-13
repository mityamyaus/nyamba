'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
if(typeof process.loadEnvFile==='function'&&fs.existsSync(path.join(__dirname,'.env')))process.loadEnvFile(path.join(__dirname,'.env'));
const{catalogFor}=require('./lib/catalog-service.cjs'),{createAuthStore,readSession}=require('./lib/auth.cjs'),maps=require('./lib/maps.cjs');const auth=createAuthStore(),root=path.join(__dirname,'dist');
const port=Number(process.env.PORT||4173),bind=process.env.BIND_ADDRESS||'127.0.0.1';
const publicOrigin=process.env.PUBLIC_ORIGIN?new URL(process.env.PUBLIC_ORIGIN).origin:null;
if(process.env.NODE_ENV==='production'&&(!publicOrigin||!publicOrigin.startsWith('https://')))throw Error('Production requires HTTPS PUBLIC_ORIGIN');
const allowedHosts=new Set(['127.0.0.1:'+port,'localhost:'+port,...(publicOrigin?[new URL(publicOrigin).host]:[])]);
const secureCookie=publicOrigin?.startsWith('https://')?'; Secure':'';
const demoDisabled=process.env.NODE_ENV==='production'&&auth.demo;
const server=http.createServer(async(req,res)=>{
 const host=req.headers.host;if(!allowedHosts.has(host)){res.writeHead(403);return res.end('Forbidden')}
 let name,url;try{url=new URL(req.url,'http://'+host);name=decodeURIComponent(url.pathname)}catch{res.writeHead(400);return res.end('Bad request')}
 if(name.startsWith('/api/')){res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');
  if(req.headers.origin&&req.headers.origin!==(publicOrigin||'http://'+host)||req.headers['sec-fetch-site']==='cross-site'){res.writeHead(403);return res.end(JSON.stringify({error:'Недопустимый источник запроса.'}))}
  try{let body={};if(req.method==='POST'){if(!String(req.headers['content-type']).startsWith('application/json'))throw Error('Нужен JSON.');let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>8192)throw Error('Запрос слишком большой.')}body=JSON.parse(raw||'{}');if(!body||Array.isArray(body)||typeof body!=='object')throw Error('Неверный запрос.')}
   const token=readSession(req.headers.cookie),key=process.env.TRUST_PROXY==='1'?String(req.headers['x-forwarded-for']||req.socket.remoteAddress).split(',').at(-1).trim():req.socket.remoteAddress;let out;if(demoDisabled&&['/api/auth/code','/api/auth/verify'].includes(name))throw Error('SMS-сервис ещё не настроен. Используйте гостевой режим.');
   if(name==='/api/auth/me'&&req.method==='GET')out={user:await auth.me(token),demo:auth.demo&&!demoDisabled};
   else if(name==='/api/auth/code'&&req.method==='POST')out=await auth.requestCode(body.phone,key);
   else if(name==='/api/auth/verify'&&req.method==='POST'){const result=await auth.verify(body.challengeId,body.code,key);res.setHeader('Set-Cookie','meal_session='+result.token+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800'+secureCookie);out={user:result.user}}
   else if(name==='/api/auth/logout'&&req.method==='POST'){out=await auth.logout(token);res.setHeader('Set-Cookie','meal_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'+secureCookie)}
   else if(name==='/api/cities'&&req.method==='GET')out=await maps.searchCities(url.searchParams.get('q'));
   else if(name==='/api/maps/config'&&req.method==='GET')out={tileUrl:maps.TILE};
   else if(name==='/api/maps/nearby'&&req.method==='GET'){if(!url.searchParams.has('lat')||!url.searchParams.has('lon'))throw Error('Нужна точка поиска.');out=await maps.nearby(Number(url.searchParams.get('lat')),Number(url.searchParams.get('lon')))}
   else{const user=await auth.me(token);if(!user){const e=Error('Войдите в приложение.');e.status=401;throw e}
    if(name==='/api/cities'&&req.method==='GET')out=await maps.searchCities(url.searchParams.get('q'));
    else if(name==='/api/profile/city'&&req.method==='POST'){const city=maps.knownCity(body.id);if(!city)throw Error('Найдите город и выберите его из списка.');out=await auth.city(token,city)}
    else if(name==='/api/maps/config'&&req.method==='GET')out={tileUrl:maps.TILE};
    else if(name==='/api/maps/nearby'&&req.method==='GET'){if(!url.searchParams.has('lat')||!url.searchParams.has('lon'))throw Error('Нужна точка поиска.');out=await maps.nearby(Number(url.searchParams.get('lat')),Number(url.searchParams.get('lon')))}
    else if(name.startsWith('/api/catalog')){if(!user.city)throw Error('Сначала выберите город.');out=await catalogFor(user).dispatch(req.method,name,body)}
    else{const e=Error('Неизвестный запрос.');e.status=404;throw e}
   }return res.end(JSON.stringify(out));
  }catch(e){res.writeHead(e.status||400);return res.end(JSON.stringify({error:e.message||'Не удалось выполнить запрос.'}))}
 }
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end()}
 if(name==='/')name='/index.html';const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end()}
 fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);return res.end('Not found')}res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webmanifest':'application/manifest+json'})[path.extname(file)]||'application/octet-stream');res.setHeader('X-Content-Type-Options','nosniff');res.end(req.method==='HEAD'?undefined:data)})
});server.listen(port,bind,()=>console.log(publicOrigin||'http://'+bind+':'+port));
