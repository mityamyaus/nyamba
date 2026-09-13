const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function environment(){const c=vm.createContext({structuredClone,console,localStorage:{setItem(){}}});for(const f of ['data.js','catalog.js','planner.js','prep-ui.js','live-catalog.js'])vm.runInContext(fs.readFileSync('dist/'+f,'utf8'),c);let app=fs.readFileSync('dist/app.js','utf8').split("$('#close').onclick")[0];vm.runInContext(app,c);return c}
test('real prices and label kcal change quantities, baskets and batches; failed switch is atomic',()=>{const c=environment();vm.runInContext(`
 state={budget:20000,people:[2000,1800],stores:[1],goals:['varied'],categories:[],equipment:['stove','oven'],prepDays:4,pregnant:[false,false]};calculate();const oldTotal=plan.total;
 // Test-only fully populated catalog; never written to app cache or served to users.
 storeCatalog.items=Object.entries(demoProducts).map(([k,p])=>({id:k,ingredient:k,store:'magnit',usable:true,stale:false,regionVerified:true,priceRub:71.23,packGrams:400,kcal100g:p[2]*1.2,fetchedAt:new Date().toISOString()}));catalogLoaded=true;
 calculate({...state,priceMode:'real'},0);
 if(plan.priceMode!=='real'||plan.total===oldTotal)throw Error('real mode not applied');
 for(const p of plan.basket){if(p.size!==400||p.price!==71.23||p.shop!==1||!p.offer)throw Error('incorrect SKU quote');if(Math.abs(p.cost-p.packs*71.23)>1e-8)throw Error('wrong pack total')}
 for(const row of plan.meals)for(const m of row){const actual=Object.entries(recipes[m.id].ing).reduce((n,[k,g])=>n+g*m.factor*products[k][2]/100,0);if(Math.abs(actual-m.kcal)>1e-7)throw Error('wrong calories')}
 const keep=JSON.stringify(plan),keepProducts=JSON.stringify(products);storeCatalog.items=[];
 try{calculate({...state,priceMode:'real'});throw Error('must reject missing offers')}catch(e){if(e.message==='must reject missing offers')throw e}
 if(JSON.stringify(plan)!==keep||JSON.stringify(products)!==keepProducts)throw Error('non-atomic failure');
 calculate({...state,priceMode:'demo'});if(products.rice[2]!==demoProducts.rice[2]||plan.catalogSnapshot!==null)throw Error('demo restore failed');
 `,c)});
test('unverified, expired, missing and wrong-store products are not selected',()=>{const c=environment();vm.runInContext(`storeCatalog.items=[{ingredient:'rice',store:'magnit',usable:false,priceRub:1,packGrams:1,fetchedAt:new Date().toISOString()},{ingredient:'rice',store:'magnit',usable:true,priceRub:1,packGrams:1,fetchedAt:'2020-01-01T00:00:00Z'}];if(Object.keys(chooseCatalog({stores:[1]})).length)throw Error('bad offer selected')`,c)});
