#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Set what flat ODF cannot carry through the LibreOffice import: view settings (frozen panes).

Runs inside the LibreOffice tools image. usage: odf_postprocess.py DIR   (edits the .ods files of DIR in place)
"""
import os, subprocess, sys, time
import uno
from com.sun.star.beans import PropertyValue


def prop(name, value):
    p = PropertyValue()
    p.Name, p.Value = name, value
    return p


def main(directory):
    proc = subprocess.Popen(['soffice', '--headless', '--norestore', '-env:UserInstallation=file:///tmp/lo-pp', '--accept=socket,host=127.0.0.1,port=2002;urp;'],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        local = uno.getComponentContext()
        resolver = local.ServiceManager.createInstanceWithContext('com.sun.star.bridge.UnoUrlResolver', local)
        for _ in range(60):
            try:
                ctx = resolver.resolve('uno:socket,host=127.0.0.1,port=2002;urp;StarOffice.ComponentContext')
                break
            except Exception:
                time.sleep(1)
        else:
            raise SystemExit('soffice did not start')
        desktop = ctx.ServiceManager.createInstanceWithContext('com.sun.star.frame.Desktop', ctx)
        for name, col, row in (('c05_layout.ods', 1, 2),):
            path = os.path.join(directory, name)
            if not os.path.exists(path):
                continue
            url = uno.systemPathToFileUrl(path)
            doc = desktop.loadComponentFromURL(url, '_blank', 0, (prop('Hidden', False),))
            ctrl = doc.getCurrentController()
            ctrl.setActiveSheet(doc.Sheets.getByIndex(0))
            ctrl.freezeAtPosition(col, row)
            doc.storeToURL(url, (prop('FilterName', 'calc8'),))
            doc.close(True)
            print('froze', name)
    finally:
        proc.terminate()


if __name__ == '__main__':
    main(sys.argv[1])
