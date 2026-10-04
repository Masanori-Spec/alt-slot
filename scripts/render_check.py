#!/usr/bin/env python3
"""Independent CI layout comparison using installed LibreOffice and Poppler.

No browser or Word is started. Only committed synthetic fixtures are processed.
"""
from pathlib import Path
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
import argparse
import re

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--reviewed', default='tests/artifacts/reviewed.docx')
parser.add_argument('--label', default='emitted')
args = parser.parse_args()
if not re.fullmatch(r'[a-z0-9-]+', args.label):
    raise SystemExit('Label must contain lowercase letters, digits or hyphens')
artifacts = root / 'tests/artifacts'
soffice = os.environ.get('SOFFICE') or shutil.which('libreoffice') or shutil.which('soffice')
if not soffice:
    raise SystemExit('LibreOffice is not installed; render validation unrun')
for name, source in [('source', root/'fixtures/bench.docx'), ('reviewed', root/args.reviewed)]:
    destination = artifacts / ('render-' + args.label + '-' + name)
    destination.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='altslot-lo-') as profile:
        subprocess.run([soffice, '-env:UserInstallation='+Path(profile).as_uri(), '--headless', '--convert-to', 'pdf', '--outdir', str(destination), str(source)], check=True, timeout=60)
    pdf = destination / (source.stem + '.pdf')
    if not pdf.is_file():
        raise SystemExit('Renderer did not produce PDF: '+str(pdf))
    subprocess.run(['pdftoppm','-r','120','-png',str(pdf),str(destination/'page')],check=True,timeout=60)
a=sorted((artifacts/('render-'+args.label+'-source')).glob('page-*.png'))
b=sorted((artifacts/('render-'+args.label+'-reviewed')).glob('page-*.png'))
if not a or len(a)!=len(b):
    raise SystemExit('Rendered page count mismatch')
rows=[]
for left,right in zip(a,b):
    ah=hashlib.sha256(left.read_bytes()).hexdigest();bh=hashlib.sha256(right.read_bytes()).hexdigest()
    rows.append({'page':left.name,'sourcePngSha256':ah,'reviewedPngSha256':bh,'identical':ah==bh})
report={'ok':all(r['identical'] for r in rows),'label':args.label,'renderer':'LibreOffice + Poppler','sourceDocxSha256':hashlib.sha256((root/'fixtures/bench.docx').read_bytes()).hexdigest(),'reviewedDocxSha256':hashlib.sha256((root/args.reviewed).read_bytes()).hexdigest(),'pages':rows,'nativeWordTested':False,'screenReaderTested':False}
(artifacts/('ci-'+args.label+'-render-comparison.json')).write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
if not report['ok']:
    raise SystemExit('Rendered pixels require inspection')
