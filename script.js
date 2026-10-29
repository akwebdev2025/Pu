(function () {
  "use strict";
  var STORE_KEY = "pu-datesheet-selection-v1";
  var LIBS = [
    ["vendor/jspdf.umd.min.js", "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"],
    ["vendor/jspdf.plugin.autotable.min.js", "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js"]
  ];
  var MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  var state = { data: null, records: [], byId: {}, selected: new Set(), cat: null, q: "", showOld: true };
  var $ = function (id) { return document.getElementById(id); };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmtDate(iso, full) {
    var p = iso.split("-"), d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
    var day = d.toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
    return (full ? day + ", " : "") + (+p[2]) + " " + MONTHS[+p[1] - 1] + " " + p[0];
  }
  function showError(msg) { $("status").innerHTML = '<div class="err" role="alert">' + esc(msg) + "</div>"; }

  /* ---------- storage (guarded) ---------- */
  function loadSel() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function saveSel() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(Array.from(state.selected))); } catch (e) { /* storage unavailable */ }
  }

  /* ---------- data ---------- */
  function validate(d) {
    if (!d || !d.exam || !Array.isArray(d.exam.categories) || !Array.isArray(d.records)) throw new Error("data.json has an unexpected structure.");
    var ok = d.records.filter(function (r) {
      return r && r.id && r.code && r.title && /^\d{4}-\d{2}-\d{2}$/.test(r.date || "") && r.category;
    });
    return { ok: ok, skipped: d.records.length - ok.length };
  }
  function init() {
    fetch("data.json", { cache: "no-cache" })
      .then(function (r) { if (!r.ok) throw new Error("data.json could not be loaded (HTTP " + r.status + ")."); return r.json(); })
      .then(function (d) {
        var v = validate(d);
        state.data = d; state.records = v.ok;
        v.ok.forEach(function (r) { state.byId[r.id] = r; });
        loadSel().forEach(function (id) { if (state.byId[id]) state.selected.add(id); });
        state.cat = d.exam.categories[0].key;
        if (v.skipped) showError(v.skipped + " record(s) in data.json were incomplete and are hidden.");
        setup();
      })
      .catch(function (e) {
        var hint = location.protocol === "file:" ? " Browsers block data loading from files opened directly. Open the site from GitHub Pages or run a local server (python -m http.server)." : "";
        showError("Could not load the datesheet data. " + e.message + hint);
        $("examSession").textContent = "";
      });
  }

  function setup() {
    var ex = state.data.exam;
    $("examTitle").textContent = ex.title.replace(/\s*\(Regular.*$/, "");
    $("examSession").textContent = ex.session + " · " + ex.university.replace(/\s*\(THEORY.*$/, "") + " (Theory examinations)";
    $("pdfRef").textContent = ex.pdfRef + ", dated " + ex.datedOnPdf;
    $("aboutText").textContent = state.records.length + " papers in " + ex.categories.length + " categories. Exam time on the date sheet: " + ex.time + ". Exam codes: " + ex.examCode + ".";
    $("q").addEventListener("input", function (e) { state.q = e.target.value; renderAll(); });
    $("oldToggle").checked = true;
    $("oldToggle").addEventListener("change", function (e) { state.showOld = e.target.checked; renderAll(); });
    $("btnClear").addEventListener("click", function () { state.selected.clear(); saveSel(); renderAll(); });
    $("btnPdf").addEventListener("click", downloadPdf);
    $("btnPrint").addEventListener("click", printSheet);
    renderAll();
    preloadLibs();
  }

  /* ---------- selection view ---------- */
  function matches(r) {
    if (!state.showOld && r.oldSyllabus && !state.selected.has(r.id)) return false;
    var q = state.q.trim().toLowerCase();
    if (!q) return true;
    return r.code.toLowerCase().indexOf(q) !== -1 || r.title.toLowerCase().indexOf(q) !== -1;
  }
  function renderAll() { renderTabs(); renderPanel(); renderReview(); }

  function renderTabs() {
    var host = $("tabs"), html = "";
    state.data.exam.categories.forEach(function (c) {
      var inCat = state.records.filter(function (r) { return r.category === c.key; });
      var shown = inCat.filter(matches).length;
      var sel = inCat.filter(function (r) { return state.selected.has(r.id); }).length;
      html += '<button class="tab" role="tab" type="button" data-cat="' + esc(c.key) + '" aria-selected="' + (c.key === state.cat) + '">' +
        esc(c.key === "COMP" ? "Compulsory" : c.key === "MINOR" ? "Minor" : c.key) +
        "<small>" + esc(c.name) + "</small><small>" + shown + " shown" + (sel ? ", " + sel + " selected" : "") + "</small></button>";
    });
    host.innerHTML = html;
    Array.prototype.forEach.call(host.querySelectorAll(".tab"), function (b) {
      b.addEventListener("click", function () { state.cat = b.getAttribute("data-cat"); renderTabs(); renderPanel(); });
    });
  }

  function paperHtml(r) {
    var id = "p-" + r.id, s = state.selected.has(r.id);
    var notes = (r.notes || []).map(function (n) { return '<span class="note">' + esc(n) + "</span>"; }).join("");
    return '<label class="paper" for="' + esc(id) + '"><input type="checkbox" id="' + esc(id) + '" data-id="' + esc(r.id) + '"' + (s ? " checked" : "") + ">" +
      '<span><span class="t"><span class="code">' + esc(r.code) + "</span> · " + esc(r.title) + "</span>" +
      (r.oldSyllabus ? '<span class="badge">Old syllabus</span>' : "") +
      '<span class="s">' + esc(fmtDate(r.date, true)) + "</span>" + notes + "</span></label>";
  }

  function renderPanel() {
    var cat = state.data.exam.categories.filter(function (c) { return c.key === state.cat; })[0];
    var list = state.records.filter(function (r) { return r.category === state.cat && matches(r); });
    list.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.code < b.code ? -1 : 1; });
    var total = state.records.filter(function (r) { return r.category === state.cat; }).length;
    $("listCount").textContent = cat.name + ": showing " + list.length + " of " + total + " papers";
    var panel = $("panel");
    if (!list.length) {
      var elsewhere = state.records.filter(matches).length;
      panel.innerHTML = '<p class="empty">No papers match in this category.' + (state.q && elsewhere ? " " + elsewhere + " match in other categories." : "") + "</p>";
      return;
    }
    var html = "", last = "";
    list.forEach(function (r) {
      if (r.date !== last) { last = r.date; html += '<div class="datehead">' + esc(fmtDate(r.date, true)) + "</div>"; }
      html += paperHtml(r);
    });
    panel.innerHTML = html;
    Array.prototype.forEach.call(panel.querySelectorAll("input[type=checkbox]"), function (cb) {
      cb.addEventListener("change", function () {
        var id = cb.getAttribute("data-id");
        if (cb.checked) state.selected.add(id); else state.selected.delete(id);
        saveSel(); renderTabs(); renderReview();
      });
    });
  }

  /* ---------- review ---------- */
  function selectedSorted() {
    return Array.from(state.selected).map(function (id) { return state.byId[id]; }).filter(Boolean)
      .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.code < b.code ? -1 : 1; });
  }
  function findClashes(sel) {
    var g = {};
    sel.forEach(function (r) { (g[r.date] = g[r.date] || []).push(r); });
    return Object.keys(g).sort().filter(function (d) { return g[d].length > 1; }).map(function (d) { return { date: d, papers: g[d] }; });
  }
  function renderReview() {
    var sel = selectedSorted(), host = $("review"), n = sel.length;
    var pill = $("navCount"); pill.hidden = !n; pill.textContent = n;
    $("btnPdf").disabled = !n; $("btnPrint").disabled = !n; $("btnClear").disabled = !n;
    if (!n) { host.innerHTML = '<p class="empty">No papers selected yet. Tick papers above and they will appear here.</p>'; return; }
    var clashes = findClashes(sel), clashDates = {};
    clashes.forEach(function (c) { clashDates[c.date] = true; });
    var html = "<p><strong>" + n + " paper" + (n > 1 ? "s" : "") + " selected</strong> across " + new Set(sel.map(function (r) { return r.date; })).size + " exam date(s).</p>";
    if (clashes.length) {
      html += '<div class="clash" role="alert"><strong>Date clash found.</strong> The date sheet gives one exam time (' + esc(state.data.exam.time) + ") per day, so papers on the same date overlap:<ul>";
      clashes.forEach(function (c) {
        html += "<li>" + esc(fmtDate(c.date, true)) + ": " + c.papers.map(function (p) { return esc(p.code); }).join(", ") + "</li>";
      });
      html += "</ul>The PDF notes that a clash must be reported with the clash Performa within 10 days of the examination. Check the official notice.</div>";
    } else html += '<p class="noclash">No date clashes among your selected papers.</p>';
    html += '<div class="scroll"><table class="sel-table"><thead><tr><th>Date</th><th>Code</th><th>Subject</th><th class="hide-s">Category</th><th><span class="sr">Remove</span></th></tr></thead><tbody>';
    sel.forEach(function (r) {
      html += "<tr><td>" + esc(fmtDate(r.date, true)) + (clashDates[r.date] ? ' <span class="badge">Clash</span>' : "") + "</td><td class=\"code\">" + esc(r.code) +
        "</td><td>" + esc(r.title) + (r.oldSyllabus ? '<span class="badge">Old syllabus</span>' : "") +
        (r.notes && r.notes.length ? '<span class="note">' + esc(r.notes.join("; ")) + "</span>" : "") +
        '</td><td class="hide-s">' + esc(r.category) + '</td><td><button class="rm" type="button" data-id="' + esc(r.id) + '" aria-label="Remove ' + esc(r.code) + '">Remove</button></td></tr>';
    });
    host.innerHTML = html + "</tbody></table></div>";
    Array.prototype.forEach.call(host.querySelectorAll(".rm"), function (b) {
      b.addEventListener("click", function () { state.selected.delete(b.getAttribute("data-id")); saveSel(); renderAll(); });
    });
  }

  /* ---------- output ---------- */
  function noteText(r, clashMap) {
    var parts = [];
    if (r.oldSyllabus) parts.push("Old syllabus");
    (r.notes || []).forEach(function (n) { parts.push(n); });
    if (clashMap[r.date]) parts.push("Same date as another selected paper");
    return parts.join("; ");
  }
  function clashMapOf(sel) { var m = {}; findClashes(sel).forEach(function (c) { m[c.date] = true; }); return m; }
  var DISCLAIMER = "Unofficial datesheet generated from the Panjab University date sheet. Verify dates and any changes on the official Panjab University website before your examinations.";

  function printSheet() {
    var sel = selectedSorted(); if (!sel.length) return;
    var cm = clashMapOf(sel), ex = state.data.exam;
    var rows = sel.map(function (r, i) {
      return "<tr><td>" + (i + 1) + "</td><td>" + esc(fmtDate(r.date, true)) + "</td><td>" + esc(r.code) + "</td><td>" + esc(r.title) + "</td><td>" + esc(r.time) + "</td><td>" + esc(noteText(r, cm)) + "</td></tr>";
    }).join("");
    $("printArea").innerHTML = "<h1>PU DateSheet Simplifier</h1><p><strong>" + esc(ex.title) + "</strong><br>" + esc(ex.session) + "<br>Papers selected: " + sel.length + "</p>" +
      "<table><thead><tr><th>#</th><th>Date</th><th>Code</th><th>Subject</th><th>Time</th><th>Notes</th></tr></thead><tbody>" + rows + "</tbody></table><p class=\"small\">" + esc(DISCLAIMER) + "</p>";
    window.print();
  }

  /* ---------- PDF library loading with fallbacks ---------- */
  var libPromise = null;
  function loadScript(urls) {
    return new Promise(function (resolve, reject) {
      var i = 0;
      (function next() {
        if (i >= urls.length) return reject(new Error("load failed"));
        var s = document.createElement("script");
        s.src = urls[i++]; s.onload = resolve; s.onerror = function () { s.remove(); next(); };
        document.head.appendChild(s);
      })();
    });
  }
  function ensureLibs() {
    if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve();
    if (!libPromise) {
      libPromise = loadScript(LIBS[0]).then(function () { return loadScript(LIBS[1]); }).catch(function (e) { libPromise = null; throw e; });
    }
    return libPromise;
  }
  function preloadLibs() { ensureLibs().catch(function () { /* handled on click */ }); }

  function downloadPdf() {
    var sel = selectedSorted(), msg = $("pdfMsg");
    msg.textContent = "";
    if (!sel.length) { msg.textContent = "Select at least one paper first."; return; }
    msg.textContent = "Preparing PDF…";
    ensureLibs().then(function () {
      var doc = new window.jspdf.jsPDF({ unit: "pt", format: "a4" });
      if (typeof doc.autoTable !== "function") throw new Error("autotable missing");
      var ex = state.data.exam, cm = clashMapOf(sel), W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
      doc.setFillColor(11, 42, 85); doc.rect(0, 0, W, 64, "F");
      doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(18);
      doc.text("PU DateSheet Simplifier", 40, 30);
      doc.setFont("helvetica", "normal"); doc.setFontSize(10);
      doc.text("Personal datesheet - " + sel.length + " paper" + (sel.length > 1 ? "s" : ""), 40, 48);
      doc.setTextColor(20, 33, 61); doc.setFontSize(11); doc.setFont("helvetica", "bold");
      var head = doc.splitTextToSize(ex.title, W - 80);
      doc.text(head, 40, 90);
      var y = 90 + head.length * 14;
      doc.setFont("helvetica", "normal"); doc.setFontSize(10);
      doc.text(ex.session + "   |   Exam time: " + ex.time + "   |   Exam code: " + ex.examCode, 40, y);
      doc.autoTable({
        startY: y + 12,
        head: [["#", "Date", "Code", "Subject", "Time", "Notes"]],
        body: sel.map(function (r, i) { return [String(i + 1), fmtDate(r.date, true), r.code, r.title, r.time, noteText(r, cm)]; }),
        theme: "grid", margin: { left: 40, right: 40, bottom: 56 },
        styles: { fontSize: 8.5, cellPadding: 4, overflow: "linebreak", valign: "top", textColor: [20, 33, 61] },
        headStyles: { fillColor: [11, 42, 85], textColor: 255 },
        columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 82 }, 2: { cellWidth: 40 }, 3: { cellWidth: "auto" }, 4: { cellWidth: 62 }, 5: { cellWidth: 82 } },
        didDrawPage: function () {
          doc.setFontSize(7.5); doc.setTextColor(81, 96, 122);
          doc.text(doc.splitTextToSize(DISCLAIMER, W - 80), 40, H - 38);
        }
      });
      var n = doc.internal.getNumberOfPages();
      for (var p = 1; p <= n; p++) { doc.setPage(p); doc.setFontSize(7.5); doc.setTextColor(81, 96, 122); doc.text("Page " + p + " of " + n, W - 40, H - 20, { align: "right" }); }
      doc.save("PU-datesheet-" + sel.length + "-papers.pdf");
      msg.textContent = "PDF downloaded.";
    }).catch(function () {
      msg.textContent = "The PDF library could not be loaded (check your internet connection). Use Print datesheet and choose Save as PDF instead.";
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
