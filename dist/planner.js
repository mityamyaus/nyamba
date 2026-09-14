// Local demo planner: meal batches, ingredient quantities, and pregnancy safeguards.
// References: NHS foods-to-avoid; FSA home-food-fact-checker; FDA/EPA fish advice.
const reviewedIngredients = new Set('oats milk apple rice buckwheat chicken carrot onion cabbage oil egg potato lentil pasta curd fish turkey beef beans tomato cucumber pepper zucchini broccoli bread yogurt banana cheese noodles peas pumpkin semolina tofu sour'.split(' '));
const batchRecipeIds = new Set([0,1,4,5,7,9,11,14,15,16,18,20,21,23,24,25,26,27,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,49,50,51,53]);
recipes.forEach((r,i)=>{r.pregnancyReviewed=i<54||r.plantBatch===true;r.batchReady=batchRecipeIds.has(i)||r.plantBatch===true});
function normalizeSettings(s){
 if(!s||typeof s!=='object')return s;
 const n=structuredClone(s);n.cuisines??=[];n.goals??=[n.mood||'varied'];n.categories??=[];n.prepDays??=1;n.menuMode??="budget";n.manualMeals??={};delete n.eggLimit;n.diets??=n.people?.map(()=>"ordinary")||[];n.allergies??=n.people?.map(()=>[])||[];n.excluded??=n.people?.map(()=>[])||[];n.pregnant??=Array.isArray(n.people)?n.people.map(()=>false):[];return n;
}
function pregnancyActive(s){return s.pregnant?.some(Boolean)||false}
function pregnancyAllowed(r,s){return !pregnancyActive(s)||(r.pregnancyReviewed===true&&!(r.risks||[]).length&&Object.keys(r.ing).every(k=>reviewedIngredients.has(k)))}
function productLabel(k,s){
 if(!pregnancyActive(s))return products[k][0];
 if(k==='fish')return 'Филе минтая или трески';
 if(['milk','curd','yogurt','cheese','sour'].includes(k))return products[k][0]+' · из пастеризованного молока';
 return products[k][0];
}
function sessionStarts(n){return Array.from({length:Math.ceil(7/n)},(_,i)=>i*n)}
function prepLabel(n){return n===1?'Каждый день':`На ${n} дня за раз`}
function storageFor(r,age,s){
 if(age===0)return 'today';
 // No timing assumptions within a day: rice/fish/pregnancy servings for later days are frozen at prep.
 if(r.ing.rice||r.ing.fish||pregnancyActive(s)||age>=2)return 'freezer';
 return 'fridge';
}
function storageLabel(kind){return{today:'Съесть в день готовки',fridge:'В холодильник',freezer:'Заморозить в день готовки'}[kind]}
function buildWeek(input,economy=false,revision=0){
 const s=normalizeSettings(input),choices=eligible(s),totalKcal=s.people.reduce((a,b)=>a+b,0);
 if(choices.some(p=>!p.length))throw Error(s.priceMode==='real'?'Для этих условий не хватает подтверждённых товаров для полного меню. Добавьте товары в каталог или измените предпочтения.':'Для этих условий нет полного меню. Добавьте оборудование или категории, либо выберите ежедневную готовку.');
 const used=new Map(),tagUses=new Map(),methodUses=new Map(),fishGrams=s.people.map(()=>0),productUses=new Map(),committedNeed={},need={},meals=Array.from({length:7},()=>Array(3)),sessions=[];
 const protein={chicken:23,turkey:24,beef:18,fish:18,egg:13,curd:17,cheese:25,lentil:24,beans:6,tofu:8,yogurt:4,oats:12,buckwheat:12};
 const vegetables=['carrot','onion','cabbage','tomato','cucumber','pepper','zucchini','broccoli','pumpkin','peas'];
 function pick(options,occurrences,avoid){
  const fishFor=(id,i)=>occurrences.reduce((g,o)=>g+(recipes[id].ing.fish||0)*s.people[i]*shares[o.m]/kcal(recipes[id]),0);
  const allowed=options.filter(id=>!s.pregnant.some((yes,i)=>yes&&fishGrams[i]+fishFor(id,i)>340+1e-8));
  if(!allowed.length)throw Error('Для выбранных условий не хватает подходящих блюд. Добавьте другие категории или оборудование.');
  const d=occurrences[0].d,m=occurrences[0].m;
  const score=id=>{const r=recipes[id],cal=kcal(r);let n=(((id+1)*37+(d+revision*3)*71+m*13)%101)/35;
   if(s.goals.includes('nutritious'))n+=Object.entries(r.ing).reduce((sum,[k,g])=>sum+(protein[k]||0)*g/100,0)/cal*120;
   if(s.goals.includes('wholesome'))n+=Object.entries(r.ing).reduce((sum,[k,g])=>sum+(vegetables.includes(k)?g:['lentil','beans','oats','buckwheat','bread'].includes(k)?g*.8:0),0)/cal*7;
   if(s.goals.includes('home')&&r.tags.includes('home'))n+=3;
   if(s.goals.includes('varied'))n+=r.tags.reduce((sum,t)=>sum+2/(1+(tagUses.get(t)||0)),0)+2/(1+(methodUses.get(method(id,s))||0));
   if(s.goals.includes('budget')||economy)n-=Object.entries(r.ing).reduce((sum,[k,g])=>sum+g/products[k][1]*price(k,s.stores).price,0)/cal*50;
   if(economy){
    const factor=occurrences.reduce((n,o)=>n+totalKcal*shares[o.m]/cal,0);
    const extra=Object.entries(r.ing).reduce((sum,[k,g])=>{const size=products[k][1],before=committedNeed[k]||0;return sum+(Math.ceil((before+g*factor)/size-1e-10)-Math.ceil(before/size-1e-10))*price(k,s.stores).price},0);
    const allowance=s.budget*occurrences.reduce((n,o)=>n+shares[o.m],0)/7;
    n-=Number(economy)*extra/Math.max(1,allowance)*8;
   }
   // Soft diversity preference across ingredients, counting every serving day in a batch.
   const weights=ingredientWeights(r);
   n-=weights.reduce((sum,[k,w])=>sum+w*(productUses.get(k)||0),0)*6;
   n-=(used.get(id)||0)*4+(avoid.has(id)?6:0);
   return n;
  };
  allowed.sort((x,y)=>score(y)-score(x));
  const pinned=[...new Set(occurrences.map(o=>s.manualMeals[o.d+'-'+o.m]).filter(id=>id!==undefined))];
  if(pinned.length>1)throw Error('В одной партии выбраны разные блюда. Измените выбор всей партии.');
  if(pinned.length&&!allowed.includes(pinned[0]))throw Error('Выбранное блюдо не подходит под текущие ограничения. Измените его в конструкторе или соберите новое меню.');
  const id=pinned.length?pinned[0]:allowed[0];used.set(id,(used.get(id)||0)+1);avoid.add(id);recipes[id].tags.forEach(t=>tagUses.set(t,(tagUses.get(t)||0)+1));methodUses.set(method(id,s),(methodUses.get(method(id,s))||0)+1);
  const chosenFactor=occurrences.reduce((n,o)=>n+totalKcal*shares[o.m]/kcal(recipes[id]),0);for(const[k,g]of Object.entries(recipes[id].ing))committedNeed[k]=(committedNeed[k]||0)+g*chosenFactor;
  ingredientWeights(recipes[id]).forEach(([k,w])=>productUses.set(k,(productUses.get(k)||0)+w*occurrences.length));s.people.forEach((_,i)=>{fishGrams[i]+=fishFor(id,i)});return id;
 }
 for(const start of sessionStarts(s.prepDays)){
  const end=Math.min(6,start+s.prepDays-1),groups=[],avoid=new Set();
  if(s.prepDays===1){for(let m=0;m<3;m++){const occurrences=[{d:start,m}],id=pick(choices[m],occurrences,avoid);groups.push({id,occurrences})}}
  else{
   const breakfastGroups=Math.min(2,end-start+1);
   for(let g=0;g<breakfastGroups;g++){const occurrences=[];for(let d=start;d<=end;d++)if((d-start)%breakfastGroups===g)occurrences.push({d,m:0});groups.push({id:pick(choices[0],occurrences,avoid),occurrences})}
   const mainOptions=choices[1].filter(id=>choices[2].includes(id));if(!mainOptions.length)throw Error('Нет блюд для порционной готовки. Добавьте категории.');
   for(let g=0;g<2;g++){const occurrences=[];for(let d=start;d<=end;d++)for(let m=1;m<3;m++)if(((d-start)+(m-1))%2===g)occurrences.push({d,m});groups.push({id:pick(mainOptions,occurrences,avoid),occurrences})}
  }
  const session={start,end,batches:[]};
  for(const group of groups){
   const r=recipes[group.id],eq=method(group.id,s),key=start+'-'+group.id;
   let batch=session.batches.find(b=>b.key===key);
   if(!batch){batch={key,id:group.id,method:eq,time:time(group.id,eq),factor:0,portions:0,servings:[],ingredients:{}};session.batches.push(batch)}
   for(const o of group.occurrences){
    const factor=totalKcal*shares[o.m]/kcal(r);let cost=0;
    for(const[k,g]of Object.entries(r.ing)){need[k]=(need[k]||0)+g*factor;batch.ingredients[k]=(batch.ingredients[k]||0)+g*factor;cost+=g*factor/products[k][1]*price(k,s.stores).price}
    const item={id:group.id,factor,cost,kcal:totalKcal*shares[o.m],method:eq,time:time(group.id,eq),prepDay:start,batchKey:key,storage:storageFor(r,o.d-start,s)};meals[o.d][o.m]=item;
    batch.factor+=factor;batch.portions+=s.people.length;batch.servings.push({...o,factor,storage:item.storage});
   }
  }
  sessions.push(session);
 }
 const basket=Object.entries(need).map(([k,g])=>{const p=products[k],chosen=price(k,s.stores),packs=Math.ceil(g/p[1]-1e-10);return{k,name:productLabel(k,s),grams:g,size:p[1],packs,...chosen,cost:packs*chosen.price}});
 const unique=new Set(meals.flat().map(m=>m.id)).size;
 return{...structuredClone(s),meals,basket,total:basket.reduce((n,p)=>n+p.cost,0),totalKcal,economy,unique,repeats:21-unique,sessions,fishGrams};
}
function storageHelp(r,s){
 const rice=!!r.ing.rice;
 return `<div class="safety-note"><b>Охладить, разделить, подписать</b><p>${rice?'Рис быстро охладите и уберите в холодильник или морозилку в течение 1 часа. В холодильнике — не более 24 часов.':'Разложите еду небольшими порциями и уберите в холодильник или морозилку в течение 2 часов; рис — в течение 1 часа, в холодильнике храните его не более 24 часов.'} Холодильник — не выше 4 °C, морозилка — −18 °C или ниже.</p><p>Порции с пометкой «заморозить» заморозьте именно в день готовки. Размораживайте в холодильнике; съешьте в течение 24 часов после полного размораживания. Разогревайте только нужную порцию один раз до 74 °C в центре. В СВЧ перемешайте и проверьте несколько участков.</p><p>В нашем плане порции на третий и четвёртый день замораживаются; ${pregnancyActive(s)?'при беременности все порции на следующие дни тоже замораживаются.':'рис и рыба на следующие дни также идут в морозилку.'} Хлеб, соусы и холодные дополнения упакуйте отдельно. Время рецепта — на обычный объём, большая партия займёт дольше.</p><a href="https://www.gov.uk/government/publications/home-food-fact-checker/home-food-fact-checker" target="_blank" rel="noreferrer">Правила для риса · FSA</a> · <a href="https://www.foodsafety.gov/food-safety-charts/cold-food-storage-charts" target="_blank" rel="noreferrer">Хранение продуктов</a></div>`;
}
function pregnancyHelp(s){if(!pregnancyActive(s))return'';return `<div class="safety-note pregnancy-note"><b>Учитываем беременность</b><p>Отмечено: ${s.pregnant.map((v,i)=>v?'человек '+(i+1):null).filter(Boolean).join(', ')}. Ограничения применяются к общим блюдам. Молочные продукты — из пастеризованного молока; мясо, рыба и яйца — полностью приготовленные. Овощи и фрукты тщательно мойте.</p><p>Рыба в этом режиме — минтай или треска; в плане не более 340 г в неделю на отмеченного человека. Калории не повышаются автоматически. Это базовый фильтр продуктов и приготовления, не проверенная индивидуальная диета: норму калорий и личные ограничения согласуйте с врачом.</p><a href="https://www.nhs.uk/pregnancy/keeping-well/foods-to-avoid/" target="_blank" rel="noreferrer">Продукты при беременности · NHS</a> · <a href="https://www.fda.gov/food/consumers/advice-about-eating-fish" target="_blank" rel="noreferrer">Выбор рыбы · FDA</a></div>`}

const dietOptions=[['ordinary','Ем мясо и рыбу'],['vegetarian','Вегетарианское · без мяса и рыбы'],['vegan','Веганское · без животных продуктов']];
const allergyOptions=[['milk','Молоко'],['egg','Яйца'],['gluten','Пшеница / глютен'],['fish','Рыба'],['soy','Соя'],['peanut','Арахис'],['nuts','Орехи'],['sesame','Кунжут'],['shellfish','Ракообразные / моллюски'],['celery','Сельдерей'],['mustard','Горчица'],['lupin','Люпин'],['sulphites','Сульфиты']];
const ingredientAllergens={milk:['milk'],curd:['milk'],yogurt:['milk'],cheese:['milk'],sour:['milk'],egg:['egg'],fish:['fish'],tofu:['soy'],oats:['gluten'],pasta:['gluten','egg'],noodles:['gluten','egg'],semolina:['gluten'],bread:['gluten','milk','egg','sesame','soy']};
function restrictionsValid(s){return ['diets','allergies','excluded'].every(k=>Array.isArray(s[k])&&s[k].length===s.people?.length)&&s.diets.every(d=>dietOptions.some(x=>x[0]===d))&&s.allergies.every(a=>Array.isArray(a)&&a.every(v=>allergyOptions.some(x=>x[0]===v)))&&s.excluded.every(a=>Array.isArray(a)&&a.every(k=>Object.hasOwn(products,k)))}
function dietaryAllowed(r,s){if(!restrictionsValid(s))return false;const allergens=new Set(s.allergies.flat()),excluded=new Set(s.excluded.flat());const vegan=s.diets.includes('vegan'),vegetarian=vegan||s.diets.includes('vegetarian');return Object.keys(r.ing).every(k=>reviewedIngredients.has(k)&&!excluded.has(k)&&!(ingredientAllergens[k]||[]).some(a=>allergens.has(a))&&!(vegetarian&&['chicken','turkey','beef','fish'].includes(k))&&!(vegan&&['milk','curd','yogurt','cheese','sour','egg','pasta','noodles','bread'].includes(k)))}
function dietaryFields(i){return '<div class="diet-fields"><label for="diet-'+i+'">Тип питания</label><select id="diet-'+i+'">'+dietOptions.map(([v,t])=>'<option value="'+v+'" '+(draft.diets[i]===v?'selected':'')+'>'+t+'</option>').join('')+'</select>'+restrictionSection(i,'allergy','Аллергии',allergyOptions,draft.allergies[i]||[])+restrictionSection(i,'excluded','Не добавлять в меню',Object.entries(products).map(([k,p])=>[k,p[0]]),draft.excluded[i]||[])+'</div>'}
function restrictionSection(i,type,title,options,selected){return '<details class="restriction-section"><summary><span><b>'+title+'</b><small id="'+type+'-summary-'+i+'">'+(selected.length?options.filter(([k])=>selected.includes(k)).map(([,t])=>t).join(', '):'Ничего не выбрано')+'</small></span><span class="restriction-chevron" aria-hidden="true">⌄</span></summary><fieldset><legend class="sr-only">'+title+'</legend><p class="restriction-hint">'+(type==='allergy'?'Отметьте всё подходящее. Если аллергии нет, оставьте пустым.':'Эти продукты исключим из общих блюд.')+'</p><div class="allergy-grid">'+options.map(([v,t])=>'<label><input type="checkbox" data-'+type+'="'+i+'" value="'+v+'" '+(selected.includes(v)?'checked':'')+'><span>'+t+'</span></label>').join('')+'</div></fieldset></details>'}
function bindRestrictionSummaries(){for(const type of ['allergy','excluded'])document.querySelectorAll('[data-'+type+']').forEach(input=>input.onchange=()=>{const i=input.dataset[type],options=type==='allergy'?allergyOptions:Object.entries(products).map(([k,p])=>[k,p[0]]),checked=Array.from(document.querySelectorAll('[data-'+type+'="'+i+'"]:checked'),x=>x.value);document.getElementById(type+'-summary-'+i).textContent=checked.length?options.filter(([k])=>checked.includes(k)).map(([,t])=>t).join(', '):'Ничего не выбрано'})}

function dietaryNote(s){const n=normalizeSettings(s);return '<p class="note">Общие блюда учитывают ограничения всех членов семьи. Исключения: '+[...new Set([...n.allergies.flat().map(v=>allergyOptions.find(x=>x[0]===v)?.[1]),...n.excluded.flat().map(k=>products[k][0])])].join(', ')+(n.allergies.flat().length||n.excluded.flat().length?'':'нет')+'. Тип питания: '+[...new Set(n.diets.map(v=>dietOptions.find(x=>x[0]===v)?.[1]))].join('; ')+'.</p>'+(n.allergies.flat().length?'<p class="note">Фильтр проверяет состав рецептов. Состав упаковок и следы аллергенов требуют отдельной проверки перед покупкой; меню не имеет гарантии «без аллергенов».</p>':'')}

function ingredientWeights(r){const entries=Object.entries(r.ing).filter(([k])=>k!=='oil');const total=entries.reduce((n,[,g])=>n+g,0);return entries.map(([k,g])=>[k,g/total])}

function planWithinBudget(s,revision=0){
 s=normalizeSettings(s);if(s.menuMode!=="budget")return buildWeek(s,false,revision);
 let best=buildWeek(s,false,revision),tested=1;
 if(best.total<=s.budget)return {...best,budgetSearch:{tested,withinBudget:true}};
 // Search progressively cheaper complete plans; never change calories or eligibility.
 let affordable=null;
 for(const pressure of [1,3,8,20]){
  for(let v=0;v<6;v++){let candidate;try{candidate=buildWeek(s,pressure,revision+v);tested++}catch{continue}
   if(candidate.total<best.total)best=candidate;
   if(candidate.total<=s.budget&&(!affordable||candidate.unique>affordable.unique||candidate.unique===affordable.unique&&candidate.total<affordable.total))affordable=candidate;
  }
  if(affordable)break;
 }
 const chosen=affordable||best;return {...chosen,budgetSearch:{tested,withinBudget:chosen.total<=s.budget}};
}
