/* SPDX-License-Identifier: Apache-2.0 */
// Executes inside the real spreadsheet editor frame.
module.exports=()=>{
   const api=SSE.getController('Main').api;
   return api.wbModel.aWorksheets.flatMap(sheet=>sheet.Drawings.map(drawing=>{
    const object=drawing.graphicObject;
    return {chart:!!object.chart,image:object.blipFill?.RasterImageId||null,
     title:object.chart?.title?.getDocContent()?.Content.map(paragraph=>paragraph.GetText()).join('').trim(),
     types:object.chart?.plotArea?.charts.map(chart=>chart.constructor.name),
     series:object.chart?.plotArea?.charts.map(chart=>chart.series.length),
     values:object.chart?.plotArea?.charts.flatMap(chart=>chart.series.flatMap(series=>
      (series.val?.numRef?.numCache?.pts||series.val?.numLit?.pts||[]).map(point=>Number(point.val)))).sort((a,b)=>a-b),
     orderedValues:object.chart?.plotArea?.charts.flatMap(chart=>chart.series.map(series=>
      (series.val?.numRef?.numCache?.pts||series.val?.numLit?.pts||[]).map(point=>Number(point.val)))),
     categories:object.chart?.plotArea?.charts.flatMap(chart=>chart.series.map(series=>
      (series.cat?.strRef?.strCache?.pts||series.cat?.numRef?.numCache?.pts||series.cat?.strLit?.pts||[]).map(point=>point.val))),
     colors:object.chart?.plotArea?.charts.flatMap(chart=>chart.series.map(series=>series.spPr?.Fill?.fill?.color?.RGBA||null))};
   }));
  };
