document.addEventListener("DOMContentLoaded", () => {
  // DOM refs
  const dropZone   = document.getElementById("drop-zone");
  const fileInput  = document.getElementById("file-input");
  const browseBtn  = document.getElementById("browse-btn");
  const previewArea= document.getElementById("preview-area");
  const previewImg = document.getElementById("preview-img");
  const previewName= document.getElementById("preview-name");
  const previewSize= document.getElementById("preview-size");
  const removeBtn  = document.getElementById("remove-btn");
  const analyzeBtn = document.getElementById("analyze-btn");
  const analyzeSpinner = document.getElementById("analyze-spinner");
  const analyzeTxt = document.getElementById("analyze-btn-text");
  const detailsSec = document.getElementById("details-section");
  const emptyDiag  = document.getElementById("empty-diag");
  const diagResult = document.getElementById("diag-result");
  const emptyProb  = document.getElementById("empty-prob");
  const probResult = document.getElementById("prob-result");
  const emptyRadar = document.getElementById("empty-radar");
  const radarResult= document.getElementById("radar-result");
  const themeToggle= document.getElementById("theme-toggle");
  const hamburger  = document.getElementById("hamburger");
  const sidebar    = document.getElementById("sidebar");
  const overlay    = document.getElementById("overlay");

  let selectedFile = null, isAnalyzing = false;
  let ringChart = null, barChart = null, radarChart = null;

  // ── Theme ──────────────────────────────────────────
  const savedTheme = localStorage.getItem("cg-theme") || "dark";
  document.documentElement.setAttribute("data-theme", savedTheme);
  themeToggle.addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("cg-theme", next);
    if (ringChart || barChart || radarChart) refreshChartTheme();
  });

  // ── Navigation ─────────────────────────────────────
  document.querySelectorAll(".nav-item").forEach(item => {
    item.addEventListener("click", e => {
      e.preventDefault();
      document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
      item.classList.add("active");
      document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
      document.getElementById("page-" + item.dataset.page).classList.add("active");
      closeSidebar();
    });
  });
  hamburger.addEventListener("click", () => { sidebar.classList.toggle("open"); overlay.classList.toggle("visible"); });
  overlay.addEventListener("click", closeSidebar);
  function closeSidebar() { sidebar.classList.remove("open"); overlay.classList.remove("visible"); }

  // ── File Handling ──────────────────────────────────
  browseBtn.addEventListener("click", e => { e.stopPropagation(); fileInput.click(); });
  dropZone.addEventListener("click", e => { if (!browseBtn.contains(e.target)) fileInput.click(); });
  fileInput.addEventListener("change", e => { if (e.target.files[0]) handleFile(e.target.files[0]); });
  dropZone.addEventListener("dragover", e => { e.preventDefault(); dropZone.classList.add("drag-over"); });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
  dropZone.addEventListener("drop", e => {
    e.preventDefault(); dropZone.classList.remove("drag-over");
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });
  removeBtn.addEventListener("click", resetUpload);

  function fmtBytes(b) {
    if (b < 1024) return b + " B";
    if (b < 1048576) return (b/1024).toFixed(1) + " KB";
    return (b/1048576).toFixed(1) + " MB";
  }

  function handleFile(file) {
    if (!file.type.startsWith("image/")) return;
    selectedFile = file;
    const reader = new FileReader();
    reader.onload = e => { previewImg.src = e.target.result; };
    reader.readAsDataURL(file);
    previewName.textContent = file.name;
    previewSize.textContent = fmtBytes(file.size);
    previewArea.classList.add("visible");
    dropZone.style.display = "none";
    analyzeBtn.style.display = "flex";
    resetResults();
  }

  function resetUpload() {
    selectedFile = null; fileInput.value = "";
    previewArea.classList.remove("visible");
    dropZone.style.display = "block";
    analyzeBtn.style.display = "none";
    resetResults();
  }

  function resetResults() {
    emptyDiag.style.display = "flex"; diagResult.style.display = "none";
    emptyProb.style.display = "flex"; probResult.style.display = "none";
    emptyRadar.style.display = "flex"; radarResult.style.display = "none";
    detailsSec.classList.remove("visible");
    [ringChart, barChart, radarChart].forEach(c => { if (c) c.destroy(); });
    ringChart = barChart = radarChart = null;
  }

  // ── Analyse ────────────────────────────────────────
  analyzeBtn.addEventListener("click", async () => {
    if (!selectedFile || isAnalyzing) return;
    isAnalyzing = true;
    analyzeBtn.disabled = true;
    analyzeTxt.textContent = "Analyzing…";
    analyzeSpinner.style.display = "block";
    const fd = new FormData();
    fd.append("file", selectedFile);
    try {
      const res = await fetch("/predict", { method: "POST", body: fd });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || "Server error"); }
      renderResults(await res.json());
    } catch (err) { alert("Analysis failed: " + err.message); }
    finally {
      isAnalyzing = false; analyzeBtn.disabled = false;
      analyzeTxt.textContent = "Run Diagnostic Analysis";
      analyzeSpinner.style.display = "none";
    }
  });

  // ── Render ─────────────────────────────────────────
  function renderResults(data) {
    // Diagnosis card
    emptyDiag.style.display = "none";
    diagResult.style.display = "block";
    diagResult.classList.add("animate-in");

    const sev = data.severity.toLowerCase();
    document.getElementById("sev-stripe").className = "sev-stripe " + sev;
    diagResult.className = "animate-in sev-" + sev;

    document.getElementById("diag-label").textContent = sev === "none" ? "Plant Status" : "Confirmed Diagnosis";
    document.getElementById("diag-name").textContent = data.abbreviation + " " + (sev === "none" ? "Confirmed" : "Identified");
    document.getElementById("diag-sub").textContent = data.prediction;
    const st = document.getElementById("sev-tag");
    st.textContent = sev === "none" ? "No Risk Detected" : "Risk: " + data.severity;
    st.className = "sev-tag " + sev;

    // Ring chart
    renderRing(data.confidence, sev);
    document.getElementById("ring-pct").textContent = data.confidence.toFixed(1) + "%";

    // Bar chart
    emptyProb.style.display = "none";
    probResult.style.display = "block";
    probResult.classList.add("animate-in");
    renderBar(data.distribution);

    // Radar chart
    emptyRadar.style.display = "none";
    radarResult.style.display = "block";
    radarResult.classList.add("animate-in");
    renderRadar(data.distribution);

    // Details
    detailsSec.classList.add("visible", "animate-in");
    document.getElementById("detail-desc").textContent = data.description;

    const sym = document.getElementById("detail-sym");
    sym.innerHTML = data.symptoms.length
      ? data.symptoms.map(s => `<li><span class="dot" style="background:var(--amber)"></span><span>${s}</span></li>`).join("")
      : `<li style="color:var(--green)">No disease symptoms detected.</li>`;

    document.getElementById("detail-act").innerHTML =
      data.actions.map(a => `<li><span class="dot" style="background:var(--green)"></span><span>${a}</span></li>`).join("");
  }

  // ── Chart helpers ──────────────────────────────────
  function isDark() { return document.documentElement.getAttribute("data-theme") === "dark"; }
  function sevColor(sev) {
    return { critical: "#ff4f4f", high: "#f5a623", moderate: "#38b2ff", none: "#00d46a" }[sev] || "#00d46a";
  }
  function gridCol() { return isDark() ? "rgba(255,255,255,.06)" : "rgba(0,0,0,.06)"; }
  function tickCol() { return isDark() ? "#3a5060" : "#9ab0c0"; }
  function tooltipStyle() {
    return {
      backgroundColor: isDark() ? "#0d1117" : "#fff",
      titleColor: isDark() ? "#e4eef6" : "#0f1923",
      bodyColor: isDark() ? "#7a9bb0" : "#4a6070",
      borderColor: isDark() ? "#1c2a38" : "#dde4ee",
      borderWidth: 1, padding: 10, cornerRadius: 8,
    };
  }

  function renderRing(confidence, sev) {
    if (ringChart) ringChart.destroy();
    const color = sevColor(sev);
    ringChart = new Chart(document.getElementById("conf-ring"), {
      type: "doughnut",
      data: {
        datasets: [{
          data: [confidence, 100 - confidence],
          backgroundColor: [color, isDark() ? "#1c2a38" : "#eef2f7"],
          borderWidth: 0, borderRadius: 4,
        }]
      },
      options: {
        cutout: "72%", responsive: false,
        animation: { duration: 900, easing: "easeOutQuart" },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
      }
    });
  }

  function renderBar(distribution) {
    if (barChart) barChart.destroy();
    const labels = distribution.map(d => d.class);
    const values = distribution.map(d => d.probability);
    const colors = distribution.map((_, i) => i === 0 ? "#00d46a" : (isDark() ? "#1c2a38" : "#dde4ee"));
    const hcolors = distribution.map((_, i) => i === 0 ? "#00b85a" : (isDark() ? "#263848" : "#c8d4e0"));
    barChart = new Chart(document.getElementById("prob-chart"), {
      type: "bar",
      data: { labels, datasets: [{ data: values, backgroundColor: colors, hoverBackgroundColor: hcolors, borderRadius: 5, borderSkipped: false }] },
      options: {
        indexAxis: "y", responsive: true, maintainAspectRatio: false,
        animation: { duration: 700, easing: "easeOutQuart" },
        plugins: { legend: { display: false }, tooltip: { ...tooltipStyle(), callbacks: { label: ctx => " " + ctx.parsed.x.toFixed(2) + "%" } } },
        scales: {
          x: { min: 0, max: 100, grid: { color: gridCol(), drawBorder: false }, ticks: { color: tickCol(), font: { size: 10 }, callback: v => v + "%" }, border: { display: false } },
          y: { grid: { display: false }, ticks: { color: tickCol(), font: { size: 10, weight: "600" } }, border: { display: false } },
        }
      }
    });
  }

  function renderRadar(distribution) {
    if (radarChart) radarChart.destroy();
    const labels = distribution.map(d => d.class);
    const values = distribution.map(d => d.probability);
    radarChart = new Chart(document.getElementById("radar-chart"), {
      type: "radar",
      data: {
        labels,
        datasets: [{
          label: "Probability %",
          data: values,
          backgroundColor: "rgba(0,212,106,.12)",
          borderColor: "#00d46a",
          pointBackgroundColor: "#00d46a",
          pointBorderColor: isDark() ? "#0d1117" : "#fff",
          pointRadius: 4, borderWidth: 2,
          fill: true,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 800, easing: "easeOutQuart" },
        plugins: { legend: { display: false }, tooltip: { ...tooltipStyle(), callbacks: { label: ctx => " " + ctx.parsed.r.toFixed(2) + "%" } } },
        scales: {
          r: {
            min: 0, max: 100,
            grid: { color: gridCol() },
            angleLines: { color: gridCol() },
            ticks: { display: false, stepSize: 25 },
            pointLabels: { color: tickCol(), font: { size: 9, weight: "600" } },
          }
        }
      }
    });
  }

  function refreshChartTheme() {
    // Re-render all active charts with new theme colors
    if (barChart) {
      const vals = barChart.data.datasets[0].data;
      barChart.data.datasets[0].backgroundColor = vals.map((_, i) => i === 0 ? "#00d46a" : (isDark() ? "#1c2a38" : "#dde4ee"));
      barChart.options.scales.x.grid.color = gridCol();
      barChart.options.scales.x.ticks.color = tickCol();
      barChart.options.scales.y.ticks.color = tickCol();
      Object.assign(barChart.options.plugins.tooltip, tooltipStyle());
      barChart.update();
    }
    if (ringChart) {
      ringChart.data.datasets[0].backgroundColor[1] = isDark() ? "#1c2a38" : "#eef2f7";
      ringChart.update();
    }
    if (radarChart) {
      radarChart.options.scales.r.grid.color = gridCol();
      radarChart.options.scales.r.angleLines.color = gridCol();
      radarChart.options.scales.r.pointLabels.color = tickCol();
      radarChart.data.datasets[0].pointBorderColor = isDark() ? "#0d1117" : "#fff";
      Object.assign(radarChart.options.plugins.tooltip, tooltipStyle());
      radarChart.update();
    }
  }
});
