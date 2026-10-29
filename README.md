# PU DateSheet Simplifier

Pick your Panjab University BA/BSc FYUGP 1st Semester papers (Nov/Dec 2026, source PDF ref. `Dec2026/nep-ug/014`) and download or print a datesheet with only those papers. Static site: HTML, CSS, vanilla JS, no backend, no keys.

## Files
- `index.html`, `style.css`, `script.js`: the site
- `data.json`: all paper records (code, title, category, official section, date, weekday, time, old-syllabus flag, notes, source page, flags)
- `validation-report.json`: counts, checks run, anomalies, records needing manual review
- `tools/source.txt` + `tools/build_data.py`: transcription of the PDF and the script that regenerates both JSON files (`python3 tools/build_data.py` from the project root)

## Deploy on GitHub Pages
1. Create a GitHub account and click **New repository**. Name it, for example, `pu-datesheet`. Keep it Public.
2. Click **uploading an existing file**. Drag in everything from this folder (`index.html`, `style.css`, `script.js`, `data.json`, `validation-report.json`, `README.md`, and the `tools` folder). Click **Commit changes**.
3. Open **Settings > Pages**.
4. Under **Build and deployment > Source**, choose **Deploy from a branch**. Set Branch to `main` and folder to `/ (root)`. Click **Save**.
5. Wait 1 to 2 minutes. The site appears at `https://<your-username>.github.io/pu-datesheet/`.

All paths are relative, so the project URL prefix works. Opening `index.html` by double-click will not load `data.json` (browser restriction). Test locally with `python3 -m http.server` and visit `http://localhost:8000`.

## PDF library
Download PDF uses jsPDF 2.5.1 and jspdf-autotable 3.8.2. `script.js` first tries `vendor/jspdf.umd.min.js` and `vendor/jspdf.plugin.autotable.min.js`, then falls back to cdnjs. To work without any external service, download those two files into a `vendor/` folder. If neither source loads, the page shows a message and **Print datesheet** (browser print, "Save as PDF") still works.

## Known limits
- One exam time (9.30 a.m. to 12.30 p.m.) is printed once in the PDF and is applied to every paper. Any two selected papers on the same date are reported as a clash.
- Eligibility is not stated for most papers; only printed notes such as "Common with…" are shown.
- See `validation-report.json` for what has and has not been verified.
