import sys,pathlib,io,hashlib,struct,zlib,bz2,json
p=pathlib.Path(__file__).parent;sys.path.insert(0,str(p));import mpyq

def read(a,name):
 e=a.get_hash_table_entry(name)
 if e is None:return None
 b=a.block_table[e.block_table_index]
 if not b.flags&mpyq.MPQ_FILE_EXISTS or b.archived_size==0:return None
 a.file.seek(b.offset);data=a.file.read(b.archived_size)
 key=a._hash(name.split('\\')[-1],'TABLE')
 if b.flags&mpyq.MPQ_FILE_FIX_KEY:key=((key+b.offset)^b.size)&0xffffffff
 def dec(data,k):return a._decrypt(data,k&0xffffffff)+data[len(data)//4*4:]
 def unpack(data,expected):
  if b.flags&mpyq.MPQ_FILE_COMPRESS and len(data)<expected:
   if data[0]==2:return zlib.decompress(data[1:])
   if data[0]==16:return bz2.decompress(data[1:])
   raise RuntimeError('unsupported compression '+str(data[0]))
  return data
 if b.flags&mpyq.MPQ_FILE_SINGLE_UNIT:
  if b.flags&mpyq.MPQ_FILE_ENCRYPTED:data=dec(data,key)
  return unpack(data,b.size)
 sector=512<<a.header['sector_size_shift'];n=(b.size+sector-1)//sector
 table=data[:4*(n+1)]
 if b.flags&mpyq.MPQ_FILE_ENCRYPTED:table=dec(table,key-1)
 offsets=struct.unpack('<'+'I'*(n+1),table)
 result=[]
 for i in range(n):
  chunk=data[offsets[i]:offsets[i+1]]
  if b.flags&mpyq.MPQ_FILE_ENCRYPTED:chunk=dec(chunk,key+i)
  result.append(unpack(chunk,min(sector,b.size-sector*i)))
 result=b''.join(result);assert len(result)==b.size,(len(result),b.size)
 return result

manifest=[]
for version in ['6.41','6.52']:
 raw=(p/f'dota-{version}.w3x').read_bytes();a=mpyq.MPQArchive(io.BytesIO(raw[raw.find(b'MPQ\x1a'):]),listfile=False)
 for name in ['war3map.wts','war3map.w3u','war3map.w3t','war3map.w3i','war3map.j','scripts\\war3map.j','Units\\HumanUnitStrings.txt','Units\\OrcUnitStrings.txt','Units\\UndeadUnitStrings.txt','Units\\NightElfUnitStrings.txt','Units\\NeutralUnitStrings.txt','Units\\CampaignUnitStrings.txt','Units\\ItemStrings.txt','Units\\AbilityStrings.txt']:
  try:
   r=read(a,name)
   if r:
    out=p/f'{version}-{name.replace(chr(92),"-")}';out.write_bytes(r)
    manifest.append({'version':version,'member':name,'bytes':len(r),'sha256':hashlib.sha256(r).hexdigest(),'extractedFile':out.name})
    print(version,name,len(r))
    for term in [b'Guinsoo',b'Azgalor',b'Pit Lord']:
     idx=r.find(term)
     if idx>=0:print(term,idx,r[max(0,idx-100):idx+180])
  except Exception as e:print(version,name,repr(e))
(p/'extraction-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
