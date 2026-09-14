const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {recipeLibrary}=require('../lib/recipe-library.cjs');
const snapshot=JSON.parse(fs.readFileSync('dist/wiki-recipes.json','utf8'));
test('Wikibooks SQLite and offline snapshot contain unique attributed original records',()=>{
 const all=recipeLibrary(new URL('https://nyamba.test/api/recipes'));assert.equal(all.version,2);assert.ok(all.recipes.length>=1400);assert.equal(all.recipes.length,snapshot.recipes.length);assert.equal(new Set(all.recipes.map(r=>r.id)).size,all.recipes.length);
 const expected=new Map(snapshot.recipes.map(r=>[r.id,r]));for(const r of all.recipes){assert.deepEqual(r,expected.get(r.id));assert.match(r.sourceUrl,/^https:\/\/ru.wikibooks.org\/w\/index.php\?oldid=\d+$/);assert.equal(r.license,'CC BY-SA 4.0');assert.ok(r.blocks.length);assert.equal(r.nutrition,null);assert.equal(r.budgetReady,false);assert.equal(r.image,undefined)}
});
test('Cuisine and search filters retain source categories without guessing',()=>{
 const r=recipeLibrary(new URL('https://nyamba.test/api/recipes?cuisine=russian'));assert.ok(r.recipes.length>50);assert.ok(r.recipes.every(x=>x.cuisines.includes('russian')));
 const q=recipeLibrary(new URL('https://nyamba.test/api/recipes?q='+encodeURIComponent('борщ')));assert.ok(q.recipes.length);assert.ok(q.recipes.every(x=>(x.name+' '+x.ingredientText).toLowerCase().includes('борщ')));assert.throws(()=>recipeLibrary(new URL('https://nyamba.test/api/recipes?cuisine=invalid')));
});
test('Source instructions are rendered as escaped text and preserve paragraph content',()=>{
 const context=vm.createContext({});let code=fs.readFileSync('dist/recipe-library.js','utf8');code=code.slice(0,code.indexOf("for(const id of"));vm.runInContext(code,context);
 assert.equal(vm.runInContext('esc("<script>")',context),'&lt;script&gt;');assert.match(vm.runInContext('renderText("Варить 10 минут.\\n\\nПодать горячим.")',context),/Варить 10 минут\./);
 const pancakes=snapshot.recipes.find(r=>r.name==='Блины');assert.ok(pancakes.blocks.some(b=>b.heading==='Процесс приготовления'));assert.ok(pancakes.blocks.some(b=>b.text.includes('Смешать сахар')));
});
