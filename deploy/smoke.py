#!/usr/bin/env python3
"""Read-only HTTPS smoke check; never skips certificate validation."""
import hashlib,json,sys,urllib.request
base=sys.argv[1].rstrip('/');expected=sys.argv[2] if len(sys.argv)>2 else None
for path,needle in [('/',b'hire me'),('/ru/','го на созвон'.encode()),('/cv.pdf',b'%PDF-'),('/en/cv.pdf',b'%PDF-'),('/favicon.svg',b'<svg')]:
 with urllib.request.urlopen(base+path,timeout=20) as r:
  assert r.status==200,path
  assert needle in r.read(),path
with urllib.request.urlopen(base+'/release-manifest.json',timeout=20) as r:release=json.load(r)
if expected:assert release['revision']==expected,(release['revision'],expected)
for path in ['index.html','ru/index.html','favicon.svg','art/atlas/manifest.json']:
 with urllib.request.urlopen(base+'/'+path,timeout=20) as r:data=r.read()
 assert hashlib.sha256(data).hexdigest()==release['files'][path],path
print('HTTPS, both languages, PDFs, favicon and release hashes passed:',release['revision'])
