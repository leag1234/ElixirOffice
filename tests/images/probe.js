// Layout probe injected into the editor frame (docs/images.md). Pure reads of the
// recalculated layout of the logic document: nothing is modified.
// window.__eoLayout() -> { pages:[{w,h,top,bottom,left,right}], paras:[...], images:[...] }
window.__eoLayout = function () {
  const ld = Asc.editor.WordControl.m_oLogicDocument;
  const pages = ld.Pages.map(p => ({ w: p.Width, h: p.Height, left: p.Margins.Left, top: p.Margins.Top, right: p.Margins.Right, bottom: p.Margins.Bottom }));
  const paras = [], images = [];
  const r2 = v => Math.round(v * 100) / 100;
  function walkContent(content, where) {
    for (let i = 0; i < content.length; i++) {
      const el = content[i];
      if (el.IsTable && el.IsTable()) {
        for (let r = 0; r < el.GetRowsCount(); r++) {
          const row = el.GetRow(r);
          for (let c = 0; c < row.GetCellsCount(); c++) walkContent(row.GetCell(c).GetContent().Content, { table: el.Id, row: r, cell: c });
        }
      } else if (el.IsParagraph && el.IsParagraph()) {
        const segs = [];
        for (let k = 0; k < el.Pages.length; k++) {
          const pg = el.Pages[k];
          if (pg.EndLine < pg.StartLine) continue;  // empty page segment (paragraph pushed to the next page)
          const b = pg.Bounds;
          segs.push({ page: el.GetAbsolutePage(k), top: r2(b.Top), bottom: r2(b.Bottom), left: r2(b.Left), right: r2(b.Right), lines: pg.EndLine - pg.StartLine + 1 });
        }
        const text = el.GetText().replace(/[\r\n\t]+$/, "");
        paras.push({ id: el.Id, text: text.slice(0, 40), len: text.length, cell: where || null, segs });
      } else if (el.Content) {  // block-level content control
        walkContent(el.Content.Content || [], where);
      }
    }
  }
  walkContent(ld.Content, null);
  const all = [];
  ld.GetAllDrawingObjects(all);
  for (const d of all) {
    if (!d.GraphicObj || !d.IsUseInDocument || !d.IsUseInDocument()) continue;
    if (d.isHdrFtrChild && d.isHdrFtrChild(false)) continue;  // header/footer drawings: reported separately
    const para = d.GetParagraph ? d.GetParagraph() : null;
    const inCell = !!(para && para.Parent && para.Parent.IsTableCellContent && para.Parent.IsTableCellContent());
    images.push({
      id: d.Id, inline: d.IsInline(), wrap: d.wrappingType, behind: !!d.behindDoc,
      page: d.PageNum, x: r2(d.X), y: r2(d.Y), w: r2(d.getXfrmExtX()), h: r2(d.getXfrmExtY()),
      anchor: para ? para.Id : null, inCell,
      relH: d.PositionH.RelativeFrom, posH: r2(d.PositionH.Value || 0), alignH: !!d.PositionH.Align, relV: d.PositionV.RelativeFrom, posV: r2(d.PositionV.Value || 0), alignV: !!d.PositionV.Align,
      locked: !!d.Locked, allowOverlap: d.AllowOverlap !== false, lockAspect: !!(d.GraphicObj.getNoChangeAspect && d.GraphicObj.getNoChangeAspect()),
      kind: d.GraphicObj.getObjectType ? d.GraphicObj.getObjectType() : null,
    });
  }
  return { pages, paras, images };
};
