'use strict';
const path=require('node:path');let rows;
function recipeLibrary(url){
 if(!rows){const{DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(path.join(__dirname,'../data/wikibooks.sqlite'),{readOnly:true});rows=db.prepare('SELECT payload FROM recipes ORDER BY name').all().map(r=>JSON.parse(r.payload));db.close()}
 const category=url.searchParams.get('category')||'',cuisine=url.searchParams.get('cuisine')||'';
 if(category&&!['breakfast','lunch','dinner'].includes(category))throw Error('Неизвестная категория.');
 if(cuisine&&!['russian','european','asian'].includes(cuisine))throw Error('Неизвестная кухня.');
 const words=(url.searchParams.get('q')||'').trim().toLocaleLowerCase('ru').slice(0,120).split(/\s+/);
 return{version:2,source:'Викиучебник',total:rows.length,recipes:rows.filter(r=>(!category||r.categories.includes(category))&&(!cuisine||r.cuisines.includes(cuisine))&&words.every(w=>(r.name+' '+r.ingredientText).toLocaleLowerCase('ru').includes(w)))};
}module.exports={recipeLibrary};
