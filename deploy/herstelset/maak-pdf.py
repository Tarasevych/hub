import html, re, sys
src, out = sys.argv[1], sys.argv[2]
lines = open(src, encoding='utf-8').read().split('\n')
body = []; pre = []; i = 0
def flush():
    global pre
    if pre:
        body.append('<pre>' + html.escape('\n'.join(pre)) + '</pre>'); pre = []
title_done = False
sectie = ''
while i < len(lines):
    l = lines[i]
    if l.startswith('====='):
        flush()
        if i + 2 < len(lines) and lines[i+2].startswith('====='):
            sectie = lines[i+1].strip()
            body.append('<h2>' + html.escape(sectie) + '</h2>'); i += 3; continue
        i += 1; continue
    if l.startswith('    ') or (sectie.startswith('1.') and l.strip()):
        pre.append(l[4:] if l.startswith('    ') else l); i += 1; continue
    flush()
    if not title_done and l.strip():
        body.append('<h1>' + html.escape(l) + '</h1>'); title_done = True
    elif re.match(r'^(КРОК|STAP) \d+\.', l):
        m = re.match(r'^((?:КРОК|STAP) \d+\.)(.*)$', l)
        body.append('<h3>' + html.escape(m.group(1)) + html.escape(m.group(2)) + '</h3>')
    elif l.strip() == '':
        body.append('<div class="sp"></div>')
    else:
        body.append('<p>' + html.escape(l) + '</p>')
    i += 1
flush()
css = """
@page { size: A4; margin: 16mm 14mm 16mm 14mm; }
body { font-family: 'DejaVu Sans', 'Noto Sans', sans-serif; font-size: 10.5pt; line-height: 1.35; color: #111; }
h1 { font-size: 16pt; margin: 0 0 6px 0; }
h2 { font-size: 13pt; border-bottom: 2px solid #333; padding-bottom: 2px; margin: 14px 0 6px 0; page-break-after: avoid; }
h3 { font-size: 11pt; margin: 10px 0 3px 0; page-break-after: avoid; background: #eee; padding: 2px 4px; }
p { margin: 0; white-space: pre-wrap; }
pre { font-family: 'DejaVu Sans Mono', monospace; font-size: 8.4pt; background: #f4f4f4; border: 1px solid #ccc;
      padding: 4px 6px; margin: 3px 0 3px 12px; white-space: pre-wrap; word-break: break-all; page-break-inside: avoid; }
.sp { height: 4px; }
"""
open(out, 'w', encoding='utf-8').write('<!doctype html><html lang="uk"><head><meta charset="utf-8"><title>00-BEGIN-HIER-UA</title><style>' + css + '</style></head><body>' + '\n'.join(body) + '</body></html>')
