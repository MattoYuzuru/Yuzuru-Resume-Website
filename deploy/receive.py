#!/usr/bin/env python3
"""Forced SSH command for static releases. Install root-owned; run without sudo."""
import fcntl,hashlib,json,os,re,shutil,sys,tarfile,tempfile,time
from pathlib import Path,PurePosixPath
BASE=Path('/srv/keykomi')
ID=re.compile(r'[a-f0-9]{40}-[0-9]{1,15}-[0-9]{1,3}')
MAX_TOTAL=768*1024*1024

def relative(name):
 p=PurePosixPath(name)
 if p.is_absolute() or '..' in p.parts or len(name)>512:raise ValueError('Unsafe archive path')
 return p

def validate(web,revision=None):
 manifest=json.loads((web/'release-manifest.json').read_text())
 if not re.fullmatch('[a-f0-9]{40}',manifest['revision']):raise ValueError('Invalid revision')
 if revision and manifest['revision']!=revision:raise ValueError('Revision mismatch')
 files=manifest['files']
 required={'index.html','ru/index.html','cv.pdf','en/cv.pdf','favicon.svg','art/atlas/manifest.json'}
 if not required<=files.keys():raise ValueError('Incomplete release')
 actual={str(p.relative_to(web)) for p in web.rglob('*') if p.is_file()}
 if actual!=set(files)|{'release-manifest.json'}:raise ValueError('Unexpected or missing release files')
 for name,digest in files.items():
  p=web/relative(name)
  if p.is_symlink() or not re.fullmatch('[a-f0-9]{64}',digest):raise ValueError('Invalid manifest entry')
  if hashlib.sha256(p.read_bytes()).hexdigest()!=digest:raise ValueError('Hash mismatch: '+name)
 for name in ['index.html','ru/index.html']:
  if 'noindex' in (web/name).read_text():raise ValueError('Preview HTML cannot be published')
 return manifest

def upload(identifier):
 releases=BASE/'releases';target=releases/identifier
 if target.exists():raise ValueError('Release already exists')
 staging=Path(tempfile.mkdtemp(prefix='.upload-',dir=releases));web=staging/'web';web.mkdir()
 try:
  total=0;count=0
  with tarfile.open(fileobj=sys.stdin.buffer,mode='r|gz') as archive:
   for entry in archive:
    p=relative(entry.name)
    if not p.parts:continue
    dest=web/p
    if entry.isdir():dest.mkdir(parents=True,exist_ok=True);dest.chmod(0o755);continue
    count+=1;total+=entry.size
    if not entry.isfile() or entry.size<0 or entry.size>64*1024*1024 or total>MAX_TOTAL or count>10000:raise ValueError('Archive exceeds release limits')
    dest.parent.mkdir(parents=True,exist_ok=True)
    source=archive.extractfile(entry)
    if source is None:raise ValueError('Missing file data')
    with dest.open('xb') as output:shutil.copyfileobj(source,output)
    dest.chmod(0o644)
  manifest=validate(web,identifier.split('-')[0])
  (staging/'RELEASE').write_text(manifest['revision']+'\n')
  staging.chmod(0o755);staging.rename(target)
  print('Uploaded',identifier,count,'files')
 except BaseException:
  shutil.rmtree(staging);raise

def switch(link,target):
 temp=BASE/(link+'.next')
 if temp.is_symlink():temp.unlink()
 os.symlink(str(target),temp);os.replace(temp,BASE/link)

def activate(identifier):
 target=BASE/'releases'/identifier;validate(target/'web',identifier.split('-')[0])
 # Keep old hashed chunks so already-open pages can finish loading after activation.
 shared=BASE/'shared/_astro';shared.mkdir(parents=True,exist_ok=True)
 for source in (target/'web/_astro').rglob('*'):
  if source.is_file():
   dest=shared/source.relative_to(target/'web/_astro');dest.parent.mkdir(parents=True,exist_ok=True)
   if dest.exists():
    if hashlib.sha256(dest.read_bytes()).digest()!=hashlib.sha256(source.read_bytes()).digest():raise ValueError('Immutable asset changed')
   else:shutil.copyfile(source,dest);dest.chmod(0o644)
 old=(BASE/'current').resolve() if (BASE/'current').is_symlink() else None
 if old and old!=target:switch('previous',old)
 switch('current',target)
 print('Activated',identifier)

def rollback():
 previous=BASE/'previous'
 if not previous.is_symlink():raise ValueError('No previous release')
 target=previous.resolve()
 if target.parent!=BASE/'releases':raise ValueError('Invalid rollback target')
 activate(target.name)

def main():
 os.umask(0o022)
 command=os.environ.get('SSH_ORIGINAL_COMMAND','').split()
 with (BASE/'.deploy.lock').open('a') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX)
  if len(command)==2 and ID.fullmatch(command[1]) and command[0] in ['upload','activate']:
   (upload if command[0]=='upload' else activate)(command[1])
  elif command==['rollback']:rollback()
  elif command==['status']:
   print((BASE/'current').resolve().name if (BASE/'current').is_symlink() else 'not-deployed')
  else:raise ValueError('Allowed: upload ID, activate ID, rollback, status')
if __name__=='__main__':
 try:main()
 except Exception as error:print(str(error),file=sys.stderr);sys.exit(1)
