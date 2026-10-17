import importlib.util,io,json,os,subprocess,sys,tarfile,tempfile,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('receiver',Path(__file__).with_name('receive.py'))
receiver=importlib.util.module_from_spec(spec);spec.loader.exec_module(receiver)
class ReceiverSafety(unittest.TestCase):
 def test_paths_cannot_escape_release(self):
  for path in ['/etc/passwd','../outside','web/../../outside']:
   with self.assertRaises(ValueError):receiver.relative(path)
 def test_upload_rejects_symlinks_and_leaves_no_release(self):
  with tempfile.TemporaryDirectory() as folder:
   base=Path(folder);(base/'releases').mkdir();receiver.BASE=base
   payload=io.BytesIO()
   with tarfile.open(fileobj=payload,mode='w:gz') as archive:
    member=tarfile.TarInfo('escape');member.type=tarfile.SYMTYPE;member.linkname='/etc';archive.addfile(member)
   payload.seek(0)
   class Input:buffer=payload
   previous=sys.stdin;sys.stdin=Input()
   try:
    with self.assertRaises(ValueError):receiver.upload('a'*40+'-1-1')
   finally:sys.stdin=previous
   self.assertEqual(list((base/'releases').iterdir()),[])
 def test_hash_mismatch_is_rejected(self):
  with tempfile.TemporaryDirectory() as folder:
   base=Path(folder);names=['index.html','ru/index.html','cv.pdf','en/cv.pdf','favicon.svg','art/atlas/manifest.json']
   for name in names:
    p=base/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text('content')
   (base/'release-manifest.json').write_text(json.dumps({'revision':'a'*40,'files':{name:'0'*64 for name in names}}))
   with self.assertRaisesRegex(ValueError,'Hash mismatch'):receiver.validate(base)
if __name__=='__main__':unittest.main()
