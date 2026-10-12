# SPDX-License-Identifier: AGPL-3.0-only
import importlib.util, tempfile, unittest
from pathlib import Path
from PIL import Image
spec = importlib.util.spec_from_file_location('prune', Path(__file__).resolve().parents[2]/'tools/desktop/prune.py')
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
class ResourceSelection(unittest.TestCase):
    def test_languages_and_first_frame_survive_with_unused_assets_removed(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            for editor in ['documenteditor','spreadsheeteditor','presentationeditor','pdfeditor']:
                for language in ['en','fr','ja']:
                    directory=root/'web-apps/apps'/editor/'main/resources/help'/language
                    directory.mkdir(parents=True);(directory/'index.htm').write_text('help')
                    (directory/'locale.json').write_text('{}')
            animation=root/'web-apps/apps/documenteditor/main/resources/help/ja/demo.gif'
            Image.new('RGB',(5,5),'red').save(animation,save_all=True,append_images=[Image.new('RGB',(5,5),'blue')])
            with animation.open('ab') as output:output.write(bytes(module.LIMIT))
            with Image.open(animation) as image:expected=image.convert('RGBA').tobytes()
            small=animation.with_name('small.gif');Image.new('RGB',(5,5),'green').save(small);small_bytes=small.read_bytes()
            for relative in ['sdkjs/visio/sdk-all.js','web-apps/apps/visioeditor/main/app.js','web-apps/vendor/monaco/monaco/editor.js','web-apps/vendor/monaco/monaco-for-ie/editor.js','sdkjs/common/libfont/fonts_ie.js']:
                file=root/relative;file.parent.mkdir(parents=True,exist_ok=True);file.write_text('unused')
            report=module.prune(root)
            self.assertEqual(report['staticHelpAnimations'],1)
            self.assertGreater(report['removedBytes'],module.LIMIT)
            self.assertFalse((root/'sdkjs/visio').exists());self.assertFalse((root/'web-apps/vendor/monaco').exists())
            self.assertFalse(list(root.rglob('*_ie.js')))
            self.assertEqual(small.read_bytes(),small_bytes)
            self.assertEqual(len(list(root.rglob('index.htm'))),12)
            self.assertEqual(len(list(root.rglob('locale.json'))),12)
            with Image.open(animation) as image:
                self.assertEqual(image.n_frames,1);self.assertEqual(image.convert('RGBA').tobytes(),expected)
if __name__ == '__main__':unittest.main()
