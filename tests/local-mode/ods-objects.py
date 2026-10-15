#!/usr/bin/env python3
"""Check public ODS chart payloads across an editor save without byte equality."""
import json
import re
import sys
import xml.etree.ElementTree as ET
import zipfile

NS = {name: 'urn:oasis:names:tc:opendocument:xmlns:' + value + ':1.0'
      for name, value in [('chart', 'chart'), ('draw', 'drawing'),
                          ('office', 'office'), ('table', 'table')]}
NS['xlink'] = 'http://www.w3.org/1999/xlink'


def charts(filename, include_caches=False):
    with zipfile.ZipFile(filename) as package:
        content = ET.fromstring(package.read('content.xml'))
        refs = [re.sub(r'^\./', '', node.get('{'+NS['xlink']+'}href', '')).rstrip('/')
                for node in content.findall('.//draw:object', NS)]
        names = [name for name in package.namelist()
                 if re.match(r'^Object[^/]*/content\.xml$', name)]
        assert len(refs) == len(names) == 2, (filename, refs, names)
        result = {}
        for name in names:
            assert name.rsplit('/', 1)[0] in refs, 'Unreferenced chart: '+name
            tree = ET.fromstring(package.read(name))
            chart = tree.find('.//chart:chart', NS)
            assert chart is not None, 'Missing chart payload: '+name
            title = ''.join(chart.find('chart:title', NS).itertext()).strip()
            columns = {}
            for row in chart.findall('.//table:table-row', NS):
                column = 0
                for cell in row.findall('table:table-cell', NS):
                    repeats = int(cell.get('{'+NS['table']+'}number-columns-repeated', '1'))
                    text = ''.join(cell.itertext()).strip()
                    if re.fullmatch(r'-?\d+(?:\.\d+)?', text):
                        for index in range(column, column + repeats):
                            columns.setdefault(index, []).append(float(text))
                    column += repeats
            ordered_values = [columns[index] for index in sorted(columns)]
            numbers = sorted(float(''.join(node.itertext()).strip())
                             for node in chart.findall('.//table:table-cell', NS)
                             if re.fullmatch(r'-?\d+(?:\.\d+)?', ''.join(node.itertext()).strip()))
            result[title] = {
                'kind': chart.get('{'+NS['chart']+'}class'),
                'series': len(chart.findall('.//chart:series', NS)),
            }
            if include_caches:
                result[title]['numbers'] = numbers
                result[title]['orderedValues'] = ordered_values
        assert set(result) == {'Total Medal Count', 'Gold&Silver Medals Count'}, result
        assert result['Total Medal Count']['series'] == 3
        assert result['Gold&Silver Medals Count']['series'] == 2
        return result


if __name__ == '__main__':
    if sys.argv[1] == '--expected':
        print(json.dumps(charts(sys.argv[2], include_caches=True)))
        sys.exit(0)
    expected = charts(sys.argv[1])
    for filename in sys.argv[2:]:
        actual = charts(filename)
        assert actual == expected, json.dumps({'file': filename, 'expected': expected, 'actual': actual})
    print('PASS two referenced chart payloads, exact titles, kinds and series')
