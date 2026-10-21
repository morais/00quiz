#!/usr/bin/env python3
"""Build and inspect the public 00Quiz upload ZIP without saving or submitting it.

Unknown publication facts and the demo URL stay absent. --require-ready refuses
an incomplete archive; no credentials or private app bindings enter the ZIP.
"""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import stat
import struct
from urllib.parse import urlsplit
import zipfile

ROOT=Path(__file__).resolve().parents[1]
PACKAGE=ROOT/'plugin'


def ensure(condition,message):
    if not condition:raise ValueError(message)


def https(value):
    u=urlsplit(value);return u.scheme=='https' and bool(u.netloc) and not u.username and not u.password and not u.fragment


def check(data):
    ensure('plugin.json' in data and 'mcp.json' in data,'Both portable manifests are required')
    ensure('.app.json' not in data,'Private app bindings are forbidden in public uploads')
    manifest=json.loads(data['plugin.json']);mcp=json.loads(data['mcp.json'])
    ensure(manifest.get('$schema')=='https://agent-plugins.org/schemas/1.0.0/plugin.schema.json','Wrong plugin schema')
    ensure(mcp.get('$schema')=='https://agent-plugins.org/schemas/1.0.0/mcp.schema.json','Wrong MCP schema')
    ensure(re.fullmatch(r'[a-z0-9](?:[a-z0-9.-]{0,62}[a-z0-9])?',manifest['name']) and '--' not in manifest['name'] and '..' not in manifest['name'],'Invalid package identity')
    ensure(re.fullmatch(r'\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?',manifest['version']),'Version must use SemVer')
    for filename,raw in data.items():
        ensure(not filename.startswith('/') and '..' not in PurePosixPath(filename).parts,'Archive path traversal')
        ensure(not any(part in {'.git','node_modules','hooks'} for part in PurePosixPath(filename).parts),'Private, dependency or hook directory')
        ensure(not re.search(rb'qq_(?:review|app|mcp)_[A-Za-z0-9_-]{43}|-----BEGIN (?:EC |RSA )?PRIVATE KEY-----|sk-proj-[A-Za-z0-9_-]+',raw),'Credential material found')
        if filename.endswith('plugin.json'):
            parsed=json.loads(raw);ext=parsed.get('extensions',{}).get('com.openai',{})
            ensure(parsed.get('apps') is None and ext.get('apps') is None,'Private app declaration found')
            ensure(parsed.get('hooks') is None and ext.get('hooks') is None,'Lifecycle hooks found')
    ext=manifest['extensions']['com.openai'];interface=ext['interface']
    categories={'Business & Operations','Communication','Creativity','Data & Analytics','Developer Tools','Education & Research','Entertainment','Finance','Healthcare','Other','Productivity','Scientific Research','Security','Travel'}
    ensure(interface.get('category') in categories,'Use an exact supported OpenAI category title')
    if interface.get('developerName'):
        ensure(isinstance(interface['developerName'],str) and 0<len(interface['developerName'].strip())<=80,'Invalid developer name')
        ensure(manifest.get('author',{}).get('name')==interface['developerName'],'Publisher names must agree')
    for key,limit in [('displayName',30),('shortDescription',30),('longDescription',4000)]:
        ensure(isinstance(interface.get(key),str) and 0<len(interface[key])<=limit,key+' has invalid length')
    for key in ['websiteURL','supportURL','privacyPolicyURL','termsOfServiceURL']:
        ensure(isinstance(interface.get(key),str) and len(interface[key])<=1024 and https(interface[key]),key+' must be HTTPS')
    prompts=interface.get('defaultPrompt',[]);prompts=[prompts] if isinstance(prompts,str) else prompts
    ensure(1<=len(prompts)<=3 and all(isinstance(p,str) and 0<len(p.strip())<=128 and '\n' not in p and '@' not in p for p in prompts),'Invalid default prompts')
    ensure(len({' '.join(p.split()) for p in prompts})==len(prompts),'Duplicate prompts')
    icons=[]
    for key,minimum in [('logo',256),('composerIcon',48)]:
        path=interface[key].removeprefix('./');ensure(path in data,'Referenced icon missing: '+key)
        raw=data[path];ensure(raw[:8]==b'\x89PNG\r\n\x1a\n' and len(raw)<=5*1024*1024,'Invalid PNG icon')
        width,height=struct.unpack('>II',raw[16:24]);ensure(width==height and minimum<=width<=4096,'Invalid icon dimensions')
        icons.append({'field':key,'path':path,'width':width,'bytes':len(raw)})
    servers=mcp['mcpServers'];ensure(len(servers)==1,'Expected exactly one 00Quiz MCP server')
    server=servers['00quiz'];ensure(server['type']=='streamable-http' and server['url']=='https://api.00quiz.com/mcp','Wrong MCP transport or endpoint')
    auth=server['extensions']['com.openai']['auth'];ensure(auth['type']=='oauth' and auth['client']=={'mode':'dcr'},'Expected OAuth with dynamic client registration')
    ensure(set(auth['defaultScopes'])=={'quiz:read','quiz:write'},'Unexpected scopes')
    cases=ext['review']['test_cases'];ensure(len(cases['positive'])==5 and len(cases['negative'])==3,'Need exactly five positive and three negative cases')
    review_prompts=ext['review'].get('prompts',[])
    ensure(isinstance(review_prompts,list) and len(review_prompts)<=20 and all(isinstance(p,str) and 0<len(p.strip())<=4000 for p in review_prompts),'Invalid review prompts')
    countries=ext.get('publication',{}).get('countries')
    if countries is not None:
        ensure(isinstance(countries,list) and all(isinstance(c,str) and re.fullmatch(r'[A-Z]{2}',c) for c in countries),'Invalid country targeting')
    for group in ['positive','negative']:
        for case in cases[group]:
            fields=['description','prompt']+(['tools_triggered','expected_behavior'] if group=='positive' else [])
            ensure(all(isinstance(case.get(k),str) and case[k].strip() for k in fields),'Incomplete review case')
            ensure(len(case['description'])<=4000,'Review description too long')
    skills=[]
    for path,raw in data.items():
        if re.fullmatch(r'skills/[^/]+/SKILL\.md',path):
            text=raw.decode();ensure(text.startswith('---\n') and len(raw)<=1024*1024,'Invalid skill document')
            front=text.split('---',2)[1];name=re.search(r'^name:\s*(\S+)\s*$',front,re.M);description=re.search(r'^description:\s*(.+)$',front,re.M)
            ensure(name and name[1]==PurePosixPath(path).parts[1] and description,'Skill metadata does not match its folder');skills.append(name[1])
    ensure(skills and ext.get('onboardingSkill','').removeprefix('./') in data,'Onboarding skill missing')
    gaps=[]
    if not manifest.get('author',{}).get('name') or not interface.get('developerName'):gaps.append('Confirmed verified publisher identity')
    if 'countries' not in ext.get('publication',{}):gaps.append('Confirmed country targeting')
    if not isinstance(ext['review'].get('commerce'),bool):gaps.append('Confirmed commerce declaration')
    recording=ext['review'].get('demo_recording_url')
    if not recording or not https(recording):gaps.append('Recorded demo with a verified reviewer-accessible URL')
    return manifest,{'icons':icons,'skills':sorted(skills),'positive_cases':5,'negative_cases':3,'missing_preparation':gaps}


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--require-ready',action='store_true');args=parser.parse_args()
    data={}
    for path in sorted(PACKAGE.rglob('*')):
        ensure(not path.is_symlink(),'Symlinks are forbidden')
        if path.is_file():data[path.relative_to(PACKAGE).as_posix()]=path.read_bytes()
    manifest,report=check(data)
    if args.require_ready:ensure(not report['missing_preparation'],'Preparation incomplete: '+', '.join(report['missing_preparation']))
    output=ROOT/'artifacts/plugin';output.mkdir(parents=True,exist_ok=True)
    suffix='preparation' if report['missing_preparation'] else 'submission'
    archive=output/f"00quiz-{manifest['version']}-{suffix}.zip"
    with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as bundle:
        for name,raw in data.items():bundle.writestr(name,raw)
    with zipfile.ZipFile(archive) as bundle:
        ensure(all(not stat.S_ISLNK(i.external_attr>>16) for i in bundle.infolist()),'ZIP contains a symlink')
        extracted={name:bundle.read(name) for name in bundle.namelist()};ensure(extracted==data,'ZIP inventory differs from source');check(extracted)
    report.update({'package':str(archive),'version':manifest['version'],'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'bytes':archive.stat().st_size,'files':sorted(data),'local_validation':'passed','portal_validation':'not run'})
    (output/'package-report.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))

if __name__=='__main__':main()
