#!/usr/bin/env python3
"""Builds data.json and validation-report.json from tools/source.txt
(source.txt = line-by-line transcription of the official PU PDF text layer)."""
import json, re, datetime, collections, sys
TIME = "9.30 a.m. to 12.30 p.m."
CATS = [("DSC","Discipline Specific Courses"),("AEC","Ability Enhancement Courses"),
        ("MDC","Inter/Multi-disciplinary Courses"),("COMP","Compulsory Punjabi/HCP/Urdu"),
        ("SEC","Skill Enhancement Courses"),("VAC","Value Added Courses"),("MINOR","Minor Subject")]
# Manual anomaly notes: only wording issues that are visible in the source text.
ANOM = {
 "10006":"Source spelling 'Defenec' preserved.",
 "10052":"Title ends with an unbalanced ')' in the source; 'Ithihaas' spelling preserved.",
 "10106":"Title ends with a doubled '))' in the source.",
 "10117":"Title wraps across lines inside the year '2024-2025'; joined.",
 "10120":"Old-syllabus marker written '(Old) (2024-2025)'.",
 "10121":"Old-syllabus marker written '(Old) (2024-2025)'.",
 "10107":"Old-syllabus marker written '(Old) (2024-2025)'.",
 "10095":"Marked '(Old)' with no year.",
 "11206":"Title ends with a trailing comma in the source.",
 "15432":"Closing parenthesis missing in the source title.",
 "15015":"Title ends with an unbalanced ')' in the source.",
 "15472":"Wording 'Photo Editing with Photoshop/Photo PEA' kept as printed; looks unusual.",
 "15949":"Code is outside the 154xx series used by neighbouring SEC (Old) papers; verify against the official PDF.",
 "15872":"Source uses ';' after '(Elective)'.",
 "15808":"Source uses ';' after 'Education'.",
 "15813":"Source has a double colon '::'.",
 "15495":"Marked '(Swayam – 2026)'; eligibility not explained in the PDF.",
 "10096":"Only paper listed under the AEC heading in the PDF; confirm against the official PDF.",
 "15043":"Same title as 15086 apart from 'and' vs '&' (E-Commerce); both kept.",
 "15086":"Same title as 15043 apart from 'and' vs '&' (E-Commerce); both kept.",
 "10110":"Listed after 10120 on the 2nd Dec; order within the date is as printed.",
}
def norm(s): return re.sub(r"\s+"," ",s).strip()
exam={}; recs=[]; sec=None; date=None; page=None; secs_seen=[]
for ln in open("tools/source.txt",encoding="utf-8"):
    ln=ln.rstrip("\n")
    if not ln.strip(): continue
    if ln.startswith("#EXAM|"):
        _,t,sub,uni=ln.split("|"); exam=dict(title=t,session=sub,university=uni); continue
    if ln.startswith("#SEC|"):
        _,key,name,head=ln.split("|"); sec=(key,name,head); secs_seen.append(key); continue
    if ln.startswith("#PAGE|"): page=int(ln.split("|")[1]); continue
    if ln.startswith("#DATE|"):
        _,iso,label=ln.split("|"); date=(iso,label); continue
    note=None
    if "@@" in ln: ln,note=ln.split("@@")
    code,title=ln.split("|",1)
    iso,label=date
    d=datetime.date.fromisoformat(iso)
    printed_day=label.split(",")[-1].strip() if "," in label else label.split()[-1]
    title=norm(title)
    old=bool(re.search(r"\((old|OLD)\b",title) or re.search(r"\(Old\)",title))
    recs.append(dict(
        id=f"{sec[0]}-{code}", code=code, title=title,
        category=sec[0], categoryName=sec[1], officialSection=sec[2],
        date=iso, dateAsPrinted=label, weekday=d.strftime("%A"), weekdayAsPrinted=printed_day,
        time=TIME, oldSyllabus=old, notes=[norm(note)] if note else [],
        sourcePage=page, flags=[ANOM[code]] if code in ANOM else []))
# ---- validation ----
by_code=collections.defaultdict(list); by_title=collections.defaultdict(list)
for r in recs:
    by_code[r["code"]].append(r["id"])
    by_title[(r["category"],re.sub(r"[^a-z0-9]","",r["title"].lower()))].append(r["code"])
dup_codes={k:v for k,v in by_code.items() if len(v)>1}
dup_titles=[v for v in by_title.values() if len(v)>1]
for grp in dup_titles:
    for r in recs:
        if r["code"] in grp: r["flags"].append("Same title as "+", ".join(c for c in grp if c!=r["code"])+" in this category (different code); both kept.")
missing=[r["id"] for r in recs if not r["code"] or not r["title"] or not r["date"]]
mism=[dict(id=r["id"],date=r["date"],computed=r["weekday"],printed=r["weekdayAsPrinted"]) for r in recs if not r["weekday"].startswith(r["weekdayAsPrinted"][:3])]
bad_code=[r["id"] for r in recs if not re.fullmatch(r"\d{5}",r["code"])]
counts=collections.OrderedDict((k,sum(1 for r in recs if r["category"]==k)) for k,_ in CATS)
dates=sorted({r["date"] for r in recs})
review=[r["id"] for r in recs if r["flags"]]
report=dict(
 generatedFrom="tools/source.txt (transcribed from the text layer of PDF Dec2026/nep-ug/014)",
 totalRecords=len(recs), countPerCategory=counts,
 distinctExamDates=dates, recordsPerDate={d:sum(1 for r in recs if r["date"]==d) for d in dates},
 oldSyllabusRecords=sum(r["oldSyllabus"] for r in recs),
 checksRun=["unique code across all records","5-digit code format","no missing code/title/date","printed weekday vs calendar weekday (Python datetime)","same-title records within a category"],
 duplicateCodes=dup_codes, nonFiveDigitCodes=bad_code, missingFields=missing, weekdayMismatches=mism,
 duplicateTitlesWithinCategory=dup_titles,
 sourceWordingAnomalies=[dict(code=c,note=n) for c,n in ANOM.items()],
 recordsRequiringManualVerification=review,
 uncertainResults=[
  "Examination time (9.30 a.m. to 12.30 p.m.) is printed once on page 1 as 'TIME OF EXAMINATION'; it is applied to every record, but the PDF text layer does not say per section that it applies.",
  "The 'Minor Subject' heading has no month/year line; 23rd Wednesday is read as December 2026 from the surrounding sections and the weekday check (23 Dec 2026 is a Wednesday).",
  "Only one paper (10096) appears under the AEC heading. Other AEC papers could exist elsewhere in the official PDF; this is unconfirmed.",
  "The DSC heading repeats on page 2 after the AEC row; page-2 papers are assigned to DSC because of that repeated heading.",
  "Section headings are kept as printed, including the typo 'COURESES' in the MDC heading.",
  "Eligibility (which courses/programmes a paper applies to) is not stated for most papers; only printed 'Common with…' / 'For B.A.' notes are captured."],
 verificationStatus=dict(
  extractionMethod="Read from the PDF text layer and transcribed line by line; wrapped titles joined by hand.",
  independentSecondExtraction=False, visualPageCheckAgainstPdfImages=False,
  statement="Programmatic checks above passed or are listed. The dataset has NOT been independently cross-checked against the PDF page images or a second extraction, so it is not claimed to be fully verified."))
json.dump(dict(exam=dict(**exam,examCode="B.A. - 5001; B.Sc - 5011",time=TIME,pdfRef="Dec2026/nep-ug/014",datedOnPdf="29-10-2026",
  categories=[dict(key=k,name=n) for k,n in CATS],
  globalNotes=["In case of internal clash, apply with the clash Performa within 10 days of examination (datesheet@pu.ac.in). See the PDF for details.","Candidates are advised to check the official Panjab University website for changes or corrections to the date sheet."]),
  records=recs),open("data.json","w",encoding="utf-8"),ensure_ascii=False,indent=1)
json.dump(report,open("validation-report.json","w",encoding="utf-8"),ensure_ascii=False,indent=1)
print(json.dumps({k:report[k] for k in ["totalRecords","countPerCategory","duplicateCodes","nonFiveDigitCodes","missingFields","weekdayMismatches","duplicateTitlesWithinCategory","oldSyllabusRecords"]},indent=1))
