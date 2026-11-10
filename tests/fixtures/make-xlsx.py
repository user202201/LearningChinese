# Makes tests/fixtures/sample.xlsx: the layout of the user's Google Sheet (one tab per child, one row per week:
# A = "第N周-YYYY-MM-DD", B..K = 10 characters, L = running total) plus a 成语 tab. Run: python3 tests/fixtures/make-xlsx.py
import datetime, openpyxl
wb = openpyxl.Workbook()
def kid(ws, weeks):
    for i, (label, chars) in enumerate(weeks):
        ws.cell(i + 1, 1, label)
        for j, ch in enumerate(chars): ws.cell(i + 1, 2 + j, ch)
        ws.cell(i + 1, 12, (i + 1) * 10)
ws = wb.active; ws.title = "Dory"
kid(ws, [("第1周-2026-10-25", "假辣酸贫纺炒缸锅烛扇"), ("第2周-2026-11-01", "鼓旧富言忙桶炉锤泉溪"), ("第3周-2026-11-08", "波坡板炭镜锁帆筐犁耙")])
ws = wb.create_sheet("Leo")                      # real Excel dates in column A; "春" is repeated in week 2 (must stay in week 1 only)
for i, (d, chars) in enumerate([(datetime.date(2026, 10, 25), "春夏秋冬风雨雷电云雪"), (datetime.date(2026, 11, 1), "春山水火土木金日月田")]):
    c = ws.cell(i + 1, 1, d); c.number_format = "yyyy-mm-dd"
    for j, ch in enumerate(chars): ws.cell(i + 1, 2 + j, ch)
    ws.cell(i + 1, 12, (i + 1) * 10)
ws = wb.create_sheet("Antoine")                  # a heading row, a row with no date, an empty week
ws.append(["周", "汉字"])
ws.append(["第1周-2026-10-25", "天", "地", "人", "你", "我", "他"])
ws.append(["随便写点什么", "好", "大"])
ws.append(["第2周-2026-11-01"])
ws = wb.create_sheet("成语")
ws.append(["第1周-2026-10-25", "一心一意", "三心二意", "画蛇添足", "守株待兔", "亡羊补牢", "掩耳盗铃"])
ws.append(["第2周-2026-11-01", "见义勇为", "一鸣惊人", "井底之蛙", "狐假虎威", "对牛弹琴", "马到成功"])
ws = wb.create_sheet("备注"); ws.sheet_state = "hidden"; ws.append(["这个标签页是隐藏的"])
wb.save("tests/fixtures/sample.xlsx")
