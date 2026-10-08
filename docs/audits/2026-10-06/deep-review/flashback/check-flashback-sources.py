import json,urllib.request,concurrent.futures,pathlib
out=pathlib.Path(__file__).resolve().parent;src=json.loads((out/'flashback-sources.json').read_text())
def get(entry):
 key,s=entry
 try:
  if 'newsId' not in s:return key,{'skipped':'primary webpage read separately'}
  r=urllib.request.urlopen(s['url'],timeout=20);a=json.load(r)['appnews']['newsitems'];matches=[x for x in a if x['gid']==s['newsId'] or (x['title']==s['label'] and x['date']==s['publishedAt'])]
  return key,{'status':r.status,'expectedId':s['newsId'],'matched':len(matches)>0,'returned':[{'id':x['gid'],'title':x['title'],'date':x['date']} for x in a]}
 except Exception as e:return key,{'error':str(e)}
r=dict(concurrent.futures.ThreadPoolExecutor(8).map(get,src.items()));checked=[(k,v) for k,v in r.items() if 'skipped' not in v];print('Checked',len(checked),'failures',[(k,v) for k,v in checked if not v.get('matched')])

assert all(v.get('matched') for k,v in checked), 'A cited Valve article did not resolve as expected'
