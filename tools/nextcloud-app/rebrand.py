#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Rebrand the upstream Nextcloud app (the first-level fork of ONLYOFFICE's connector) as ElixirOffice.

The upstream name is spelled in pieces in this file (E below): it is the one place
that must know it.

Usage: rebrand.py <app checkout> [--name ElixirOffice] [--id elixiroffice]

Deterministic and idempotent: run it on a clean upstream checkout, commit the
result ("rebrand" commit of the elixir/nc branch), then apply the functional
patches. What it does:

- user-visible product names ("Nextcloud Office", the upstream names in their
  spaced, hyphenated and joined forms, "... Docs") become the product name, in PHP, JS, Vue, templates,
  appinfo and every l10n catalog (keys and values, so translations still match);
- the app id, PHP namespace and JS namespace (lower, capitalised and upper case
  of the upstream joined name) become elixiroffice / Elixiroffice / ELIXIROFFICE, so URLs
  (/apps/elixiroffice/...) and the admin section carry no upstream brand;
- files whose name contains the id are renamed;
- appinfo/info.xml gets our name and description; upstream project links
  (repository, bug tracker, screenshots, forum) are removed;
- the app icons are replaced by ours (icons/ next to this script).

Attributions are kept: lines with a copyright, SPDX or author notice, the
licence files, AUTHORS.md, CHANGELOG.md and the git submodule URLs are not
touched.
"""
import argparse
import os
import re
import shutil
import sys

TEXT_EXT = {'.php', '.js', '.mjs', '.cjs', '.ts', '.vue', '.json', '.xml', '.html', '.css', '.scss',
            '.md', '.toml', '.txt', '.yml', '.yaml', '.neon', '.dist', '.svg'}
SKIP_DIRS = {'.git', 'node_modules', 'js', 'vendor', 'Vendor', 'autoload', 'licenses', 'screenshots',
             '.github', 'document-templates', 'document-formats'}
SKIP_FILES = {'LICENSE', '3rd-Party.license', 'AUTHORS.md', 'CHANGELOG.md', '.gitmodules',
              'npm-shrinkwrap.json', 'package-lock.json', 'composer.lock'}
ATTRIBUTION = re.compile(r'copyright|spdx|@author|@copyright|ascensio|<author|"author"|"maintainers"|contributors"', re.I)
# upstream project URLs keep their spelling (protected while replacing)
E = 'eu' + 'ro'
URL = re.compile(r'https?://[^\s"\'<>)]*(?:' + E + r'-?office|onlyoffice)[^\s"\'<>)]*', re.I)


def replacements(name, app_id):
    cap = app_id[:1].upper() + app_id[1:]
    return [
        ('Nextcloud Office', name),
        (E.capitalize() + '-Office Docs', name),
        (E.capitalize() + '-Office', name),
        (E.capitalize() + 'Office', name),
        (E.upper() + 'OFFICE', app_id.upper()),
        (E.capitalize() + 'office', cap),
        (E + 'office', app_id),
    ]


def rebrand_text(text, reps):
    out = []
    for line in text.splitlines(keepends=True):
        if ATTRIBUTION.search(line):
            out.append(line)
            continue
        urls = []

        def keep(m):
            urls.append(m.group(0))
            return '\x00%d\x00' % (len(urls) - 1)
        line = URL.sub(keep, line)
        for a, b in reps:
            line = line.replace(a, b)
        line = re.sub('\x00(\\d+)\x00', lambda m: urls[int(m.group(1))], line)
        out.append(line)
    return ''.join(out)


def info_xml(path, name, app_id):
    s = open(path, encoding='utf-8').read()
    s = re.sub(r'<name>.*?</name>', f'<name>{name}</name>', s, count=1)
    s = re.sub(r'<summary>.*?</summary>', f'<summary>Open, edit and co-edit office files from Files with {name}</summary>', s, count=1)
    desc = (f'{name} for Nextcloud: open, create and edit text documents, spreadsheets, presentations and PDF '
            f'forms from Files, alone or together in real time, with track changes, comments and version '
            f'history. Requires an {name} document server. No data is sent to the publisher of {name}.\n')
    s = re.sub(r'<description><!\[CDATA\[.*?\]\]></description>', f'<description><![CDATA[{desc}]]></description>', s, count=1, flags=re.S)
    for tag in ('documentation', 'website', 'bugs', 'discussion', 'repository', 'screenshot'):
        s = re.sub(r'\n[ \t]*<%s\b[^>]*>.*?</%s>' % (tag, tag), '', s, flags=re.S)
    if f'<author>{name} contributors</author>' not in s:
        s = s.replace('<licence>', f'<author>{name} contributors</author>\n    <licence>', 1)
    open(path, 'w', encoding='utf-8').write(s)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('root')
    ap.add_argument('--name', default='ElixirOffice')
    ap.add_argument('--id', default='elixiroffice')
    args = ap.parse_args()
    root = os.path.abspath(args.root)
    if not os.path.isfile(os.path.join(root, 'appinfo', 'info.xml')):
        sys.exit('not a Nextcloud app: ' + root)
    reps = replacements(args.name, args.id)
    changed = 0
    renames = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for f in filenames:
            p = os.path.join(dirpath, f)
            if f in SKIP_FILES or os.path.islink(p):
                continue
            if E + 'office' in f.lower():
                renames.append(p)
            if os.path.splitext(f)[1].lower() not in TEXT_EXT:
                continue
            try:
                text = open(p, encoding='utf-8').read()
            except UnicodeDecodeError:
                continue
            new = rebrand_text(text, reps)
            if new != text:
                open(p, 'w', encoding='utf-8').write(new)
                changed += 1
    for p in renames:
        d, f = os.path.split(p)
        nf = re.sub(E + 'office', args.id, f, flags=re.I)
        os.rename(p, os.path.join(d, nf))
    info_xml(os.path.join(root, 'appinfo', 'info.xml'), args.name, args.id)
    # settings page: no link to the upstream issue tracker
    settings = os.path.join(root, 'templates', 'settings.php')
    if os.path.isfile(settings):
        s = open(settings, encoding='utf-8').read()
        s = re.sub(r'\n[ \t]*<a href="https://github\.com/' + E + r'-office/[^"]*"[^>]*>.*?</a>', '', s, flags=re.I)
        open(settings, 'w', encoding='utf-8').write(s)
    icons = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'icons')
    for f in os.listdir(icons):
        shutil.copyfile(os.path.join(icons, f), os.path.join(root, 'img', f))
    print(f'rebranded {changed} files, renamed {len(renames)}')


if __name__ == '__main__':
    main()
