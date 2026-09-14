"""Russian Wikibooks recipe import. Source text CC BY-SA 4.0; retain revision attribution."""
import datetime,hashlib,html,json,pathlib,re,sqlite3,time,urllib.parse,urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[1]
CACHE=ROOT/'.sites-runtime/wiki-cache';CACHE.mkdir(parents=True,exist_ok=True)
UA='Nyamba/1.0 (recipe library; https://xn--h1adljlcbmt0d.xn--p1ai)'
def api(**params):
 params.update(action='query',format='json',formatversion=2,maxlag=5)
 url='https://ru.wikibooks.org/w/api.php?'+urllib.parse.urlencode(params)
 file=CACHE/(hashlib.sha256(url.encode()).hexdigest()+'.json')
 if file.exists():return json.loads(file.read_text(encoding='utf-8'))
 for attempt in range(4):
  try:
   time.sleep(.4)
   with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':UA}),timeout=45) as response:x=json.load(response)
   if 'error' in x:raise ValueError(str(x['error']))
   file.write_text(json.dumps(x,ensure_ascii=False),encoding='utf-8');return x
  except Exception:
   if attempt==3:raise
   time.sleep(2**attempt)
def clean(text):
 text=re.sub(r'<!--.*?-->','',text,flags=re.S)
 text=re.sub(r'<ref\b[^>]*>.*?</ref>|<ref\b[^>]*/>','',text,flags=re.S|re.I)
 text=re.sub(r'\[\[(?:Файл|File|Изображение|Image|Категория|Category):[^\n]*?\]\]','',text,flags=re.I)
 text=re.sub(r'\[\[([^\[\]]+)\]\]',lambda m:m[1].split('|')[-1].removeprefix('Рецепт:'),text)
 text=re.sub(r'\[https?://\S+\s+([^\]]+)\]',r'\1',text)
 text=re.sub(r'\[https?://[^\]]+\]','',text)
 # Remove presentation/citation templates, without generating missing recipe content.
 for _ in range(12):
  next_text=re.sub(r'\{\{[^{}]*\}\}','',text)
  if next_text==text:break
  text=next_text
 text=re.sub(r'<[^>]+>','',text)
 text=text.replace("'''",'').replace("''",'')
 text=re.sub(r'__[A-Z_]+__','',text)
 text=html.unescape(text).replace('\xa0',' ')
 return re.sub(r'\n{3,}','\n\n',text).strip()
def convert(page):
 rev=page['revisions'][0];raw=rev['slots']['main']['content']
 if re.match(r'\s*#(?:REDIRECT|перенаправление)',raw,re.I):return None
 title=page['title'];cats=[c['title'].removeprefix('Категория:') for c in page.get('categories',[])]
 text=clean(raw)
 # Preserve the original order and variant headings; do not merge different ingredient lists.
 sections=re.split(r'(?m)^\s*(={2,6})\s*(.*?)\s*\1\s*$',text)
 blocks=[]
 if sections[0].strip():blocks.append({'heading':'О блюде','text':sections[0].strip()})
 for i in range(1,len(sections),3):
  heading=sections[i+1];body=sections[i+2].strip()
  if body and not re.search(r'ссылки|источник|литература|см\. также|примечан',heading,re.I):blocks.append({'heading':heading,'text':body})
 ingredient_text='\n'.join(b['text'] for b in blocks if re.search(r'ингредиент|состав|продукт',b['heading'],re.I))
 instructions=any(re.search(r'приготов|процесс|технолог',b['heading'],re.I) for b in blocks)
 cuisines=[]
 allcats=' '.join(cats).lower()
 for k,words in {'russian':['русская кухня'],'european':['европейская','русская','французская','итальянская','немецкая','испанская','греческая','польская','белорусская','украинская','английская','венгерская'],'asian':['азиатская','китайская','японская','корейская','тайская','индийская','узбекская','казахская','вьетнамская']}.items():
  if any(w in allcats for w in words):cuisines.append(k)
 meals=[]
 for k,word in [('breakfast','завтрак'),('lunch','обед'),('dinner','ужин')]:
  if word in allcats:meals.append(k)
 return {'id':'wiki-'+str(page['pageid']),'name':title.removeprefix('Рецепт:'),'source':'Викиучебник','sourceUrl':'https://ru.wikibooks.org/w/index.php?oldid='+str(rev['revid']),'historyUrl':'https://ru.wikibooks.org/w/index.php?title='+urllib.parse.quote(title)+'&action=history','license':'CC BY-SA 4.0','licenseUrl':'https://creativecommons.org/licenses/by-sa/4.0/deed.ru','sourceUpdatedAt':rev['timestamp'],'importedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'categories':meals,'sourceCategories':cats,'cuisines':cuisines,'blocks':blocks,'ingredientText':ingredient_text,'hasInstructions':instructions,'nutrition':None,'servings':None,'budgetReady':False,'formatNote':'Удалена вики-разметка, изображения и справочный аппарат; текст не пересказан. Варианты рецепта сохранены в исходном порядке.'}
def main():
 members=[];cont={}
 while True:
  x=api(list='categorymembers',cmtitle='Категория:Рецепты',cmtype='page',cmlimit=500,**cont)
  members.extend(x['query']['categorymembers']);cont=x.get('continue',{})
  if not cont:break
 print('Source pages:',len(members),flush=True)
 records=[]
 for start in range(0,len(members),20):
  ids='|'.join(str(p['pageid']) for p in members[start:start+20])
  x=api(pageids=ids,prop='revisions|categories',rvprop='ids|timestamp|content',rvslots='main',cllimit=500)
  if 'continue' in x:raise RuntimeError('Unexpected category continuation; avoid incomplete classification')
  for p in x['query']['pages']:
   if p.get('missing') or 'revisions' not in p:continue
   r=convert(p)
   if r:records.append(r)
  print('Imported',min(start+20,len(members)),flush=True)
 if len(records)<1000:raise RuntimeError('Incomplete import; previous database retained')
 target=ROOT/'data';target.mkdir(exist_ok=True)
 db=sqlite3.connect(target/'wikibooks.sqlite')
 db.execute('CREATE TABLE IF NOT EXISTS recipes(id TEXT PRIMARY KEY,name TEXT NOT NULL,source_url TEXT UNIQUE NOT NULL,payload TEXT NOT NULL)')
 with db:
  db.execute('DELETE FROM recipes')
  db.executemany('INSERT INTO recipes VALUES(?,?,?,?)',[(r['id'],r['name'],r['sourceUrl'],json.dumps(r,ensure_ascii=False)) for r in records])
 assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok';db.close()
 (ROOT/'dist/wiki-recipes.json').write_text(json.dumps({'version':2,'source':'Викиучебник','recipes':records},ensure_ascii=False),encoding='utf-8')
 print('DONE',len(records),'with instructions',sum(r['hasInstructions'] for r in records),flush=True)
if __name__=='__main__':main()
