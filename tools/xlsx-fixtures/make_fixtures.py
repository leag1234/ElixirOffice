#!/usr/bin/env python3
"""Generate realistic, deterministic .xlsx fixtures for the spreadsheet editor.

Usage: python3 tools/xlsx-fixtures/make_fixtures.py [output_dir]
Default output_dir: tests/fixtures/xlsx (relative to the repository root).
Requires openpyxl (python3 -m pip install --user openpyxl).
"""
import datetime as dt
import os
import random
import re
import sys
import zipfile

from openpyxl import Workbook
from openpyxl.chart import BarChart, LineChart, PieChart, Reference, Series
from openpyxl.chart.data_source import StrRef
from openpyxl.chart.series import SeriesLabel
from openpyxl.comments import Comment
from openpyxl.formatting.rule import (CellIsRule, ColorScaleRule, DataBarRule,
                                      FormulaRule, IconSetRule)
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.workbook.defined_name import DefinedName
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.worksheet.hyperlink import Hyperlink
from openpyxl.worksheet.table import Table, TableStyleInfo

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "tests", "fixtures", "xlsx")

CURRENCY = '"$"#,##0.00'
CURRENCY0 = '"$"#,##0'
DATE = "yyyy-mm-dd"
PERCENT = "0.0%"
THIN = Side(style="thin", color="A6A6A6")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
HEADER_FONT = Font(bold=True, color="FFFFFF")
HEADER_FILL = PatternFill("solid", fgColor="1F4E78")
TITLE_FONT = Font(bold=True, size=16, color="1F4E78")
LIGHT_RED = PatternFill("solid", fgColor="FFC7CE")
DARK_RED_FONT = Font(color="9C0006")
FIXED_CREATED = dt.datetime(2025, 1, 6, 9, 0, 0)


def add_name(wb, name, ref):
    dn = DefinedName(name, attr_text=ref)
    try:
        wb.defined_names[name] = dn  # openpyxl >= 3.1
    except TypeError:
        wb.defined_names.append(dn)


def header_row(ws, row, headers, fill=HEADER_FILL):
    for col, text in enumerate(headers, 1):
        c = ws.cell(row=row, column=col, value=text)
        c.font = HEADER_FONT
        c.fill = fill
        c.border = BORDER
        c.alignment = Alignment(horizontal="center", vertical="center")


def widths(ws, values):
    for col, w in enumerate(values, 1):
        ws.column_dimensions[get_column_letter(col)].width = w


def save(wb, name):
    wb.properties.creator = "ElixirOffice fixtures"
    wb.properties.created = FIXED_CREATED
    wb.properties.modified = FIXED_CREATED
    path = os.path.join(OUT, name)
    wb.save(path)
    normalize(path)
    print("wrote", path)


def normalize(path):
    """Make the output byte-reproducible: fixed zip timestamps and modified date."""
    with zipfile.ZipFile(path) as zin:
        entries = [(i.filename, zin.read(i.filename)) for i in zin.infolist()]
    stamp = FIXED_CREATED.strftime("%Y-%m-%dT%H:%M:%SZ").encode()
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as zout:
        for fname, data in entries:
            if fname == "docProps/core.xml":
                data = re.sub(rb"(<dcterms:modified[^>]*>)[^<]*", rb"\g<1>" + stamp, data)
            info = zipfile.ZipInfo(fname, date_time=FIXED_CREATED.timetuple()[:6])
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o600 << 16
            zout.writestr(info, data)


# --------------------------------------------------------------------------
# c01 - sales report
# --------------------------------------------------------------------------
PRODUCTS = [
    # code, name, category, unit price
    ("P-100", "Ergonomic Office Chair", "Furniture", 249.00),
    ("P-110", "Standing Desk", "Furniture", 539.00),
    ("P-200", "27-inch Monitor", "Electronics", 319.00),
    ("P-210", "Wireless Keyboard", "Electronics", 59.90),
    ("P-220", "Noise-cancelling Headset", "Electronics", 149.00),
    ("P-300", "A4 Paper (box of 5 reams)", "Supplies", 27.50),
    ("P-310", "Desk Organizer", "Supplies", 18.75),
    ("P-400", "Coffee Machine", "Appliances", 429.00),
]
REGIONS = [
    # region, manager, target (USD)
    ("North", "Emily Carter", 60000),
    ("South", "Daniel Moore", 50000),
    ("East", "Olivia Bennett", 55000),
    ("West", "Lucas Harris", 65000),
]


def make_c01():
    rnd = random.Random(2025)
    wb = Workbook()
    summary = wb.active
    summary.title = "Summary"
    sales = wb.create_sheet("Sales 2025")
    products = wb.create_sheet("Products")
    regions = wb.create_sheet("Regions")
    summary.sheet_properties.tabColor = "1F4E78"
    sales.sheet_properties.tabColor = "70AD47"
    products.sheet_properties.tabColor = "FFC000"
    regions.sheet_properties.tabColor = "C00000"

    # ---- Products ----
    products["A1"] = "Product catalogue"
    products["A1"].font = TITLE_FONT
    products.merge_cells("A1:E1")
    header_row(products, 3, ["Code", "Product", "Category", "Unit price", "In stock"])
    for i, (code, name, cat, price) in enumerate(PRODUCTS, start=4):
        products.cell(row=i, column=1, value=code)
        products.cell(row=i, column=2, value=name)
        products.cell(row=i, column=3, value=cat)
        products.cell(row=i, column=4, value=price).number_format = CURRENCY
        products.cell(row=i, column=5, value=rnd.choice([True, True, True, False]))
    last_p = 3 + len(PRODUCTS)
    t = Table(displayName="tblProducts", ref=f"A3:E{last_p}")
    t.tableStyleInfo = TableStyleInfo(name="TableStyleMedium9", showRowStripes=True)
    products.add_table(t)
    widths(products, [10, 30, 14, 12, 10])
    products["G3"] = "Supplier portal"
    products["G3"].hyperlink = "https://www.example.com/suppliers"
    products["G3"].style = "Hyperlink"
    add_name(wb, "ProductList", f"Products!$B$4:$B${last_p}")
    add_name(wb, "PriceTable", f"Products!$B$4:$D${last_p}")

    # ---- Regions ----
    regions["A1"] = "Regional targets 2025"
    regions["A1"].font = TITLE_FONT
    regions.merge_cells("A1:D1")
    header_row(regions, 3, ["Region", "Manager", "Annual target", "Share of target"])
    for i, (reg, mgr, target) in enumerate(REGIONS, start=4):
        regions.cell(row=i, column=1, value=reg).border = BORDER
        regions.cell(row=i, column=2, value=mgr).border = BORDER
        c = regions.cell(row=i, column=3, value=target)
        c.number_format = CURRENCY0
        c.border = BORDER
        c = regions.cell(row=i, column=4, value=f"=C{i}/SUM($C$4:$C$7)")
        c.number_format = PERCENT
        c.border = BORDER
    regions["A8"] = "Total"
    regions["A8"].font = Font(bold=True)
    regions["C8"] = "=SUM(C4:C7)"
    regions["C8"].number_format = CURRENCY0
    regions["C8"].font = Font(bold=True)
    regions["B4"].comment = Comment("Emily joined as regional manager in March 2025.", "Sales Ops")
    widths(regions, [12, 20, 16, 16])
    add_name(wb, "RegionTargets", "Regions!$A$4:$C$7")

    # ---- Sales 2025 ----
    headers = ["Date", "Region", "Product", "Units", "Unit price", "Total", "Discount", "Rating"]
    sales.append(headers)
    start = dt.date(2025, 1, 2)
    n = 120
    for i in range(n):
        day = start + dt.timedelta(days=int(i * 362 / n) + rnd.randint(0, 2))
        reg = rnd.choice(REGIONS)[0]
        code, name, cat, price = rnd.choice(PRODUCTS)
        units = rnd.randint(1, 40) if price < 100 else rnd.randint(1, 15)
        disc = rnd.choice([0, 0, 0.05, 0.05, 0.08, 0.10, 0.12, 0.15])
        r = i + 2
        sales.append([day, reg, name, units, price, f"=D{r}*E{r}", disc, rnd.randint(1, 5)])
    last = n + 1
    for r in range(2, last + 1):
        sales.cell(row=r, column=1).number_format = DATE
        sales.cell(row=r, column=5).number_format = CURRENCY
        sales.cell(row=r, column=6).number_format = CURRENCY
        sales.cell(row=r, column=7).number_format = "0%"
    t = Table(displayName="tblSales", ref=f"A1:H{last}")
    t.tableStyleInfo = TableStyleInfo(name="TableStyleMedium2", showRowStripes=True)
    sales.add_table(t)
    sales.freeze_panes = "A2"
    widths(sales, [12, 10, 28, 8, 12, 13, 10, 8])
    sales.conditional_formatting.add(
        f"D2:D{last}", DataBarRule(start_type="min", end_type="max", color="5B9BD5"))
    sales.conditional_formatting.add(
        f"F2:F{last}", ColorScaleRule(start_type="min", start_color="F8696B",
                                      mid_type="percentile", mid_value=50, mid_color="FFEB84",
                                      end_type="max", end_color="63BE7B"))
    sales.conditional_formatting.add(
        f"G2:G{last}", CellIsRule(operator="greaterThan", formula=["0.1"],
                                  fill=LIGHT_RED, font=DARK_RED_FONT))
    sales.conditional_formatting.add(
        f"H2:H{last}", IconSetRule("3Arrows", "num", [1, 3, 5], showValue=True))
    add_name(wb, "SalesData", f"'Sales 2025'!$A$2:$H${last}")
    add_name(wb, "VatRate", "0.2")

    # ---- Summary ----
    s = summary
    s["A1"] = "Sales Report 2025"
    s["A1"].font = TITLE_FONT
    s["A1"].alignment = Alignment(horizontal="center")
    s.merge_cells("A1:F1")
    s["A2"] = "Report date:"
    s["B2"] = "=TODAY()"
    s["B2"].number_format = DATE
    s["A2"].font = Font(italic=True)
    s["A2"].comment = Comment("TODAY() recalculates whenever the workbook is opened.", "Finance")

    header_row(s, 4, ["Region", "Revenue", "Target", "Achieved", "Status", "Manager"])
    rng_reg = f"'Sales 2025'!$B$2:$B${last}"
    rng_tot = f"'Sales 2025'!$F$2:$F${last}"
    for i, (reg, _mgr, _t) in enumerate(REGIONS, start=5):
        s.cell(row=i, column=1, value=reg)
        s.cell(row=i, column=2, value=f"=ROUND(SUMIF({rng_reg},A{i},{rng_tot}),2)").number_format = CURRENCY
        s.cell(row=i, column=3, value=f"=VLOOKUP(A{i},Regions!$A$4:$C$7,3,FALSE)").number_format = CURRENCY0
        s.cell(row=i, column=4, value=f"=IF(C{i}=0,0,B{i}/C{i})").number_format = PERCENT
        s.cell(row=i, column=5, value=f'=IF(D{i}>=1,"On target",IF(D{i}>=0.8,"Close","Behind"))')
        s.cell(row=i, column=6, value=f"=VLOOKUP(A{i},Regions!$A$4:$B$7,2,FALSE)")
        for col in range(1, 7):
            s.cell(row=i, column=col).border = BORDER
    s["A9"] = "Total"
    s["B9"] = "=SUM(B5:B8)"
    s["C9"] = "=SUM(C5:C8)"
    s["D9"] = "=IF(C9=0,0,B9/C9)"
    for ref, fmt in (("B9", CURRENCY), ("C9", CURRENCY0), ("D9", PERCENT)):
        s[ref].number_format = fmt
    for col in range(1, 7):
        c = s.cell(row=9, column=col)
        c.font = Font(bold=True)
        c.border = Border(top=Side(style="thin"), bottom=Side(style="double"))

    s["A11"] = "Average order value"
    s["B11"] = f"=ROUND(AVERAGE({rng_tot}),2)"
    s["B11"].number_format = CURRENCY
    s["A12"] = "Orders with discount > 10%"
    s["B12"] = f"=COUNTIF('Sales 2025'!$G$2:$G${last},\">0.1\")"
    s["A13"] = "Revenue incl. VAT"
    s["B13"] = "=ROUND(B9*(1+VatRate),2)"
    s["B13"].number_format = CURRENCY
    for r in (11, 12, 13):
        s.cell(row=r, column=1).font = Font(bold=True)

    # monthly revenue block for the line chart
    header_row(s, 15, ["Month", "Revenue"])
    rng_date = f"'Sales 2025'!$A$2:$A${last}"
    for m in range(1, 13):
        r = 15 + m
        s.cell(row=r, column=1, value=dt.date(2025, m, 1)).number_format = "mmm yyyy"
        # classic formulas only: SUMIF with date bounds via SUMPRODUCT-free pair of SUMIFs
        s.cell(row=r, column=2,
               value=(f"=SUMIF({rng_date},\">=\"&A{r},{rng_tot})"
                      f"-SUMIF({rng_date},\">\"&EOMONTH(A{r},0),{rng_tot})")).number_format = CURRENCY0
    widths(s, [28, 14, 14, 12, 12, 18])

    bar = BarChart()
    bar.type = "col"
    bar.title = "Revenue vs target by region"
    bar.y_axis.title = "USD"
    bar.add_data(Reference(s, min_col=2, max_col=3, min_row=4, max_row=8), titles_from_data=True)
    bar.set_categories(Reference(s, min_col=1, min_row=5, max_row=8))
    bar.height, bar.width = 7.5, 14
    s.add_chart(bar, "H3")

    line = LineChart()
    line.title = "Monthly revenue 2025"
    line.y_axis.title = "USD"
    line.add_data(Reference(s, min_col=2, min_row=15, max_row=27), titles_from_data=True)
    line.set_categories(Reference(s, min_col=1, min_row=16, max_row=27))
    line.height, line.width = 7.5, 14
    s.add_chart(line, "H19")

    pie = PieChart()
    pie.title = "Revenue share by region"
    pie.add_data(Reference(s, min_col=2, min_row=4, max_row=8), titles_from_data=True)
    pie.set_categories(Reference(s, min_col=1, min_row=5, max_row=8))
    pie.height, pie.width = 7.5, 10
    s.add_chart(pie, "P3")

    s["A29"] = "Sales dashboard (intranet)"
    s["A29"].hyperlink = "https://www.example.com/dashboards/sales-2025"
    s["A29"].style = "Hyperlink"
    s["A30"] = "Go to the order list"
    s["A30"].hyperlink = Hyperlink(ref="A30", location="'Sales 2025'!A1", display="Go to the order list")
    s["A30"].style = "Hyperlink"
    save(wb, "c01-sales-report.xlsx")


# --------------------------------------------------------------------------
# c02 - grade book
# --------------------------------------------------------------------------
STUDENTS = [
    "Aaliyah Brooks", "Benjamin Clarke", "Chloe Davies", "Dylan Evans", "Ella Fisher",
    "Finn Graham", "Grace Hughes", "Harry Irving", "Isla Jenkins", "Jack Kennedy",
    "Katie Lawson", "Liam Mitchell", "Mia Nolan", "Noah Owens", "Olivia Parker",
    "Oscar Quinn", "Poppy Reid", "Ryan Stewart", "Sophie Turner", "Thomas Underwood",
    "Uma Vaughan", "Victor Walsh", "Willow Young", "Xavier Adams", "Yasmin Baker",
    "Zachary Cole", "Amelia Dixon", "Ethan Foster", "Freya Gibson", "George Hall",
]
ASSESSMENTS = ["Quiz 1", "Essay 1", "Quiz 2", "Lab report", "Midterm", "Quiz 3", "Project", "Final exam"]


def make_c02():
    rnd = random.Random(30)
    wb = Workbook()
    ws = wb.active
    ws.title = "Grades"
    ws.sheet_properties.tabColor = "7030A0"
    headers = ["Student"] + ASSESSMENTS + ["Average", "Best", "Lowest", "Rank", "Grade", "Effort"]
    header_row(ws, 1, headers, fill=PatternFill("solid", fgColor="44546A"))
    for i, name in enumerate(STUDENTS, start=2):
        ws.cell(row=i, column=1, value=name)
        base = rnd.randint(55, 92)
        for j in range(len(ASSESSMENTS)):
            ws.cell(row=i, column=2 + j, value=max(30, min(100, base + rnd.randint(-15, 12))))
        ws.cell(row=i, column=10, value=f"=ROUND(AVERAGE(B{i}:I{i}),1)").number_format = "0.0"
        ws.cell(row=i, column=11, value=f"=MAX(B{i}:I{i})")
        ws.cell(row=i, column=12, value=f"=MIN(B{i}:I{i})")
        ws.cell(row=i, column=13, value=f"=RANK(J{i},$J$2:$J$31)")
        ws.cell(row=i, column=14,
                value=f'=IF(J{i}>=90,"A",IF(J{i}>=80,"B",IF(J{i}>=70,"C",IF(J{i}>=60,"D","F"))))')
        ws.cell(row=i, column=15, value=rnd.choice(["Excellent", "Good", "Good", "Satisfactory", "Needs work"]))
        for col in range(1, 16):
            ws.cell(row=i, column=col).border = BORDER
    ws["A33"] = "Class average"
    ws["A34"] = "Highest"
    ws["A35"] = "Lowest"
    for j in range(2, 11):
        L = get_column_letter(j)
        ws[f"{L}33"] = f"=ROUND(AVERAGE({L}2:{L}31),1)"
        ws[f"{L}34"] = f"=MAX({L}2:{L}31)"
        ws[f"{L}35"] = f"=MIN({L}2:{L}31)"
        ws[f"{L}33"].number_format = "0.0"
    for r in (33, 34, 35):
        ws.cell(row=r, column=1).font = Font(bold=True)
    ws["A37"] = "Passing mark"
    ws["B37"] = 60
    ws["A37"].font = Font(bold=True)
    ws["B37"].comment = Comment("Scores below this mark are highlighted in red.", "Ms. Thompson")

    ws.conditional_formatting.add("B2:I31", ColorScaleRule(
        start_type="num", start_value=40, start_color="F8696B",
        mid_type="num", mid_value=70, mid_color="FFEB84",
        end_type="num", end_value=100, end_color="63BE7B"))
    ws.conditional_formatting.add("A2:A31", FormulaRule(
        formula=["$J2<$B$37"], fill=LIGHT_RED, font=Font(bold=True, color="9C0006")))
    ws.conditional_formatting.add("N2:N31", CellIsRule(
        operator="equal", formula=['"A"'], fill=PatternFill("solid", fgColor="C6EFCE")))

    dv = DataValidation(type="list", formula1='"Excellent,Good,Satisfactory,Needs work"',
                        allow_blank=True, showErrorMessage=True,
                        errorTitle="Invalid effort", error="Pick a value from the list.",
                        promptTitle="Effort", prompt="Choose the effort level")
    ws.add_data_validation(dv)
    dv.add("O2:O31")
    dv2 = DataValidation(type="whole", operator="between", formula1="0", formula2="100",
                         showErrorMessage=True, error="Scores must be between 0 and 100.")
    ws.add_data_validation(dv2)
    dv2.add("B2:I31")

    ws.freeze_panes = "B2"
    widths(ws, [20] + [10] * 8 + [9, 7, 8, 7, 7, 13])

    chart = BarChart()
    chart.type = "col"
    chart.title = "Class average per assessment"
    chart.y_axis.title = "Score"
    chart.y_axis.scaling.min = 0
    chart.y_axis.scaling.max = 100
    chart.add_data(Reference(ws, min_col=2, max_col=9, min_row=33, max_row=33), from_rows=True,
                   titles_from_data=False)
    chart.set_categories(Reference(ws, min_col=2, max_col=9, min_row=1, max_row=1))
    chart.legend = None
    chart.height, chart.width = 8, 16
    ws.add_chart(chart, "Q2")

    ws.page_setup.orientation = "landscape"
    ws.page_setup.paperSize = ws.PAPERSIZE_A4
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.print_title_rows = "1:1"
    ws.print_area = "A1:O37"
    ws.oddHeader.center.text = "Year 10 Science - Grade Book 2025/26"
    ws.oddHeader.right.text = "Ms. Thompson"
    ws.oddFooter.left.text = "Confidential - student data"
    ws.oddFooter.center.text = "Page &P of &N"
    ws.oddFooter.right.text = "Printed &D"
    ws.print_options.gridLines = True
    save(wb, "c02-gradebook.xlsx")


# --------------------------------------------------------------------------
# c03 - budget
# --------------------------------------------------------------------------
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def make_c03():
    rnd = random.Random(12)
    wb = Workbook()
    ws = wb.active
    ws.title = "Budget 2026"
    ws.sheet_properties.tabColor = "00B050"
    ws["A1"] = "Riverside Community Association - Budget 2026"
    ws["A1"].font = TITLE_FONT
    ws.merge_cells("A1:P1")
    header_row(ws, 3, ["Line item", "Code"] + MONTHS + ["Total", "% of total"])
    neg = '#,##0.00;[Red]-#,##0.00'
    income = [("Membership fees", "IN-01", 1450), ("Event tickets", "IN-02", 620),
              ("Grants", "IN-03", 900), ("Donations", "IN-04", 300)]
    expenses = [("Hall rental", "EX-01", -800), ("Utilities", "EX-02", -260),
                ("Insurance", "EX-03", -145), ("Event supplies", "EX-04", -410),
                ("Newsletter printing", "EX-05", -95), ("Website & software", "EX-06", -60),
                ("Volunteer expenses", "EX-07", -120)]

    def block(title, rows, first):
        ws.cell(row=first, column=1, value=title).font = Font(bold=True, color="1F4E78")
        r = first + 1
        for name, code, base in rows:
            ws.cell(row=r, column=1, value=name)
            ws.cell(row=r, column=2, value=code)
            for m in range(12):
                v = round(base * (1 + rnd.uniform(-0.25, 0.25)), 2)
                ws.cell(row=r, column=3 + m, value=v).number_format = neg
            ws.cell(row=r, column=15, value=f"=SUM(C{r}:N{r})").number_format = neg
            r += 1
        return first + 1, r - 1

    i0, i1 = block("Income", income, 4)
    ws.cell(row=i1 + 1, column=1, value="Total income").font = Font(bold=True)
    tin = i1 + 1
    e0, e1 = block("Expenses", expenses, tin + 2)
    tex = e1 + 1
    ws.cell(row=tex, column=1, value="Total expenses").font = Font(bold=True)
    net = tex + 2
    ws.cell(row=net, column=1, value="Net result").font = Font(bold=True, size=12)
    for col in range(3, 16):
        L = get_column_letter(col)
        ws.cell(row=tin, column=col, value=f"=SUM({L}{i0}:{L}{i1})").number_format = neg
        ws.cell(row=tex, column=col, value=f"=SUM({L}{e0}:{L}{e1})").number_format = neg
        ws.cell(row=net, column=col, value=f"={L}{tin}+{L}{tex}").number_format = neg
        for r in (tin, tex, net):
            ws.cell(row=r, column=col).font = Font(bold=True)
            ws.cell(row=r, column=col).border = Border(top=Side(style="thin"))
    for r in range(i0, i1 + 1):
        ws.cell(row=r, column=16, value=f"=O{r}/$O${tin}").number_format = PERCENT
    for r in range(e0, e1 + 1):
        ws.cell(row=r, column=16, value=f"=O{r}/$O${tex}").number_format = PERCENT

    # outline: group the expense detail rows (collapsible), hide the Code column
    for r in range(e0, e1 + 1):
        ws.row_dimensions[r].outlineLevel = 1
    for r in range(i0, i1 + 1):
        ws.row_dimensions[r].outlineLevel = 1
    ws.sheet_properties.outlinePr.summaryBelow = True
    ws.column_dimensions["B"].hidden = True
    ws.freeze_panes = "C4"
    widths(ws, [24, 8] + [11] * 12 + [13, 10])
    ws.cell(row=net + 2, column=1, value="Opening balance")
    ws.cell(row=net + 2, column=3, value=4200).number_format = neg
    ws.cell(row=net + 3, column=1, value="Closing balance")
    ws.cell(row=net + 3, column=3, value=f"=C{net + 2}+O{net}").number_format = neg
    ws.cell(row=net + 3, column=1).font = Font(bold=True)

    chart = LineChart()
    chart.title = "Monthly income, expenses and net result"
    for r in (tin, tex, net):
        series = Series(Reference(ws, min_col=3, max_col=14, min_row=r, max_row=r))
        series.tx = SeriesLabel(strRef=StrRef(f"'{ws.title}'!$A${r}"))
        chart.series.append(series)
    chart.set_categories(Reference(ws, min_col=3, max_col=14, min_row=3, max_row=3))
    chart.height, chart.width = 8, 18
    ws.add_chart(chart, f"A{net + 6}")

    notes = wb.create_sheet("Notes")
    notes.sheet_properties.tabColor = "A5A5A5"
    notes["A1"] = "Notes for the treasurer"
    notes["A1"].font = TITLE_FONT
    paragraphs = [
        ("Budget basis", "All figures are in US dollars and are based on the 2025 actuals, adjusted "
         "for the new hall rental agreement that starts in January. Income is shown as positive "
         "values and expenses as negative values so that the net result is a simple sum."),
        ("Grants", "The municipal community grant is paid in quarterly instalments. If the grant "
         "is delayed, the board has agreed to postpone the autumn newsletter printing rather than "
         "draw on the reserve fund."),
        ("Hidden column", "Column B contains internal accounting codes used by the bookkeeper. It is "
         "hidden in the budget view; unhide it to reconcile with the general ledger."),
        ("Grouped rows", "Detail rows are grouped so that the board can collapse the budget to "
         "show only the totals during the annual general meeting."),
        ("Approval", "This budget was presented to the board on 18 November 2025 and approved "
         "unanimously, subject to a mid-year review in June 2026."),
    ]
    for i, (title, text) in enumerate(paragraphs, start=3):
        notes.cell(row=i, column=1, value=title).font = Font(bold=True)
        c = notes.cell(row=i, column=2, value=text)
        c.alignment = Alignment(wrap_text=True, vertical="top")
        notes.cell(row=i, column=1).alignment = Alignment(vertical="top")
        notes.row_dimensions[i].height = 62
    notes.column_dimensions["A"].width = 18
    notes.column_dimensions["B"].width = 70
    save(wb, "c03-budget.xlsx")


# --------------------------------------------------------------------------
# c04 - nearly blank
# --------------------------------------------------------------------------
def make_c04():
    wb = Workbook()
    ws = wb.active
    ws.title = "Sheet1"
    for i, (num, text) in enumerate(zip([10, 20, 30, 40, 50],
                                        ["apple", "banana", "cherry", "date", "elderberry"]), start=1):
        ws.cell(row=i, column=1, value=num)
        ws.cell(row=i, column=2, value=text)
    ws["C1"] = "=A1*2"
    ws["C5"] = "note"
    ws["A6"] = "=SUM(A1:A5)"
    save(wb, "c04-blank-ish.xlsx")


# --------------------------------------------------------------------------
# c05 - pivot source
# --------------------------------------------------------------------------
def make_c05():
    rnd = random.Random(200)
    wb = Workbook()
    ws = wb.active
    ws.title = "Data"
    ws.append(["Date", "Category", "Region", "Salesperson", "Amount"])
    cats = {"Software": (400, 4000), "Hardware": (150, 2500), "Services": (300, 6000),
            "Training": (200, 1500), "Support": (100, 900)}
    people = {"North": ["Alice Morgan", "Brian Lee"], "South": ["Carmen Diaz", "David Kim"],
              "East": ["Elena Rossi", "Frank Wright"], "West": ["Grace Chen", "Henry Patel"]}
    start = dt.date(2025, 1, 1)
    for i in range(200):
        d = start + dt.timedelta(days=rnd.randint(0, 364))
        cat = rnd.choice(sorted(cats))
        reg = rnd.choice(sorted(people))
        lo, hi = cats[cat]
        ws.append([d, cat, reg, rnd.choice(people[reg]), round(rnd.uniform(lo, hi), 2)])
    rows = sorted(ws.iter_rows(min_row=2, values_only=True), key=lambda r: (r[0], r[3]))
    for r, vals in enumerate(rows, start=2):
        for c, v in enumerate(vals, start=1):
            ws.cell(row=r, column=c, value=v)
        ws.cell(row=r, column=1).number_format = DATE
        ws.cell(row=r, column=5).number_format = CURRENCY
    t = Table(displayName="tblOrders", ref="A1:E201")
    t.tableStyleInfo = TableStyleInfo(name="TableStyleLight9", showRowStripes=True)
    ws.add_table(t)
    ws.freeze_panes = "A2"
    widths(ws, [12, 12, 10, 16, 12])
    save(wb, "c05-pivot-source.xlsx")


def main():
    os.makedirs(OUT, exist_ok=True)
    make_c01()
    make_c02()
    make_c03()
    make_c04()
    make_c05()


if __name__ == "__main__":
    main()
