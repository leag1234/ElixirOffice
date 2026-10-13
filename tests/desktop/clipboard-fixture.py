# SPDX-License-Identifier: AGPL-3.0-only
import gi,sys
gi.require_version('Gtk','3.0')
from gi.repository import Gtk,Gdk,GdkPixbuf,GLib
clipboard=Gtk.Clipboard.get(Gdk.SELECTION_CLIPBOARD)
clipboard.set_image(GdkPixbuf.Pixbuf.new_from_file(sys.argv[1]))
print('READY',flush=True)
GLib.MainLoop().run()
