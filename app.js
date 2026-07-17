// ===========================================================
// TODOLIST — app.js
// Tutto in locale (localStorage), nessun server, nessuna key.
// ===========================================================
(() => {
  "use strict";

  const STORAGE_KEY = "todolist_ppl_v1";

  const SECTION_META = {
    personale: { label: "Personale", accent: "#4FB4A8" },
    lavoro: { label: "Lavoro", accent: "#E8A33D" },
  };

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // ---------- STATE ----------
  function defaultState() {
    return {
      sections: {
        personale: { categories: [{ id: "generale", name: "Generale" }], tasks: [] },
        lavoro: { categories: [{ id: "generale", name: "Generale" }], tasks: [] },
      },
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      if (!parsed.sections || !parsed.sections.personale || !parsed.sections.lavoro) return defaultState();
      return parsed;
    } catch (e) {
      return defaultState();
    }
  }

  let state = loadState();

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  // ---------- NAVIGATION ----------
  let currentSection = null;
  let activeCategoryId = "all";

  const viewHome = document.getElementById("view-home");
  const viewSection = document.getElementById("view-section");

  function goHome() {
    currentSection = null;
    viewHome.classList.add("active");
    viewSection.classList.remove("active");
    renderHome();
  }

  function openSection(key) {
    currentSection = key;
    activeCategoryId = "all";
    const meta = SECTION_META[key];
    document.getElementById("section-title").textContent = meta.label;
    viewSection.style.setProperty("--accent", meta.accent);
    viewSection.classList.add("active");
    viewHome.classList.remove("active");
    renderSection();
  }

  document.querySelectorAll(".tile").forEach((tile) => {
    tile.addEventListener("click", () => openSection(tile.dataset.section));
  });
  document.getElementById("btn-back").addEventListener("click", goHome);

  // ---------- RENDER: HOME ----------
  function renderHome() {
    const d = new Date();
    const dateStr = d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
    document.getElementById("home-date").textContent = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);

    ["personale", "lavoro"].forEach((key) => {
      const tasks = state.sections[key].tasks.filter((t) => !t.completed);
      document.getElementById(`badge-${key}`).textContent = tasks.length;
      document.getElementById(`sub-${key}`).textContent =
        tasks.length === 0 ? "tutto fatto" : tasks.length === 1 ? "1 attività da fare" : `${tasks.length} attività da fare`;
    });
  }

  // ---------- RENDER: SECTION ----------
  function renderCategoryFilters() {
    const wrap = document.getElementById("category-filters");
    wrap.innerHTML = "";
    const cats = state.sections[currentSection].categories;

    function makeChip(label, id) {
      const btn = document.createElement("button");
      btn.className = "cat-chip" + (activeCategoryId === id ? " active" : "");
      btn.textContent = label;
      btn.addEventListener("click", () => {
        activeCategoryId = id;
        renderSection();
      });
      return btn;
    }

    wrap.appendChild(makeChip("Tutte", "all"));
    cats.forEach((c) => wrap.appendChild(makeChip(c.name, c.id)));
  }

  function categoryName(id) {
    const c = state.sections[currentSection].categories.find((c) => c.id === id);
    return c ? c.name : "Generale";
  }

  function renderSection() {
    renderCategoryFilters();

    const allTasks = state.sections[currentSection].tasks;
    const filtered = activeCategoryId === "all" ? allTasks : allTasks.filter((t) => t.categoryId === activeCategoryId);

    const active = filtered.filter((t) => !t.completed).sort((a, b) => b.createdAt - a.createdAt);
    const completed = filtered.filter((t) => t.completed).sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));

    const activeList = document.getElementById("task-list-active");
    activeList.innerHTML = "";
    active.forEach((t) => activeList.appendChild(renderTaskItem(t)));

    document.getElementById("empty-state").classList.toggle("show", active.length === 0);

    const compList = document.getElementById("task-list-completed");
    compList.innerHTML = "";
    completed.forEach((t) => compList.appendChild(renderTaskItem(t)));
    document.getElementById("completed-count").textContent = completed.length;

    renderHome(); // keep badges fresh
  }

  function renderTaskItem(task) {
    const el = document.createElement("div");
    el.className = "task-item" + (task.completed ? " done" : "");
    el.dataset.id = task.id;

    const check = document.createElement("button");
    check.className = "task-check";
    check.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    check.addEventListener("click", () => toggleTask(task.id));

    const body = document.createElement("div");
    body.className = "task-body";
    const text = document.createElement("div");
    text.className = "task-text";
    text.textContent = task.text;
    body.appendChild(text);
    const cat = document.createElement("span");
    cat.className = "task-cat";
    cat.textContent = categoryName(task.categoryId);
    body.appendChild(cat);

    const del = document.createElement("button");
    del.className = "task-delete";
    del.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    del.addEventListener("click", () => deleteTask(task.id));

    el.appendChild(check);
    el.appendChild(body);
    el.appendChild(del);
    return el;
  }

  function toggleTask(id) {
    const t = state.sections[currentSection].tasks.find((t) => t.id === id);
    if (!t) return;
    t.completed = !t.completed;
    t.completedAt = t.completed ? Date.now() : null;
    saveState();
    renderSection();
  }

  function deleteTask(id) {
    const arr = state.sections[currentSection].tasks;
    const idx = arr.findIndex((t) => t.id === id);
    if (idx > -1) arr.splice(idx, 1);
    saveState();
    renderSection();
  }

  document.getElementById("completed-toggle").addEventListener("click", (e) => {
    e.currentTarget.classList.toggle("open");
    document.getElementById("task-list-completed").classList.toggle("open");
  });

  // ---------- CATEGORY CREATION ----------
  const catBackdrop = document.getElementById("cat-backdrop");
  const catSheet = document.getElementById("category-sheet");
  const catInput = document.getElementById("category-input");

  function openCategorySheet() {
    catInput.value = "";
    catBackdrop.classList.add("show");
    catSheet.classList.add("show");
    setTimeout(() => catInput.focus(), 300);
  }
  function closeCategorySheet() {
    catBackdrop.classList.remove("show");
    catSheet.classList.remove("show");
  }
  document.getElementById("btn-add-category").addEventListener("click", openCategorySheet);
  document.getElementById("category-cancel").addEventListener("click", closeCategorySheet);
  catBackdrop.addEventListener("click", () => {
    if (catSheet.classList.contains("show")) closeCategorySheet();
  });
  document.getElementById("category-confirm").addEventListener("click", () => {
    const name = catInput.value.trim();
    if (!name) return closeCategorySheet();
    const id = uid();
    state.sections[currentSection].categories.push({ id, name });
    activeCategoryId = id;
    saveState();
    closeCategorySheet();
    renderSection();
  });

  // ---------- TASK PARSER (euristico, in italiano, senza API) ----------
  const LEAD_STRIP = [
    "devo anche", "devo", "dobbiamo anche", "dobbiamo", "bisogna anche", "bisogna",
    "c'è da", "c'e da", "ci sarebbe da", "servirebbe", "poi devo", "poi bisogna",
    "e poi devo", "e poi", "poi", "inoltre devo", "inoltre", "e anche devo", "e anche",
    "anche devo", "anche", "dopodiché devo", "dopodiche devo", "dopodiché", "dopodiche",
    "e di", "e", "un'altra cosa", "un altra cosa",
  ];

  const SPLIT_CONNECTORS = [
    "poi devo", "poi bisogna", "e poi devo", "e poi", "poi",
    "inoltre devo", "inoltre", "e anche devo", "e anche", "anche devo",
    "dopodiché devo", "dopodiche devo", "dopodiché", "dopodiche",
    "successivamente devo", "successivamente", "in più devo", "in piu devo", "in più", "in piu",
    "un'altra cosa", "un altra cosa", "un'ultima cosa", "un ultima cosa",
  ];

  const MIDSENTENCE_TRIGGERS = ["devo", "dobbiamo", "bisogna", "c'è da", "c'e da"];

  function parseTasksFromText(raw) {
    if (!raw) return [];
    let text = raw.trim();
    if (!text) return [];

    let lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);

    let fragments = [];
    lines.forEach((line) => {
      line = line.replace(/^[\-\u2022\*]\s*/, "").replace(/^\d+[\.\)]\s*/, "");
      const bySentence = line.split(/(?<=[.;!?])\s+/).map((s) => s.trim()).filter(Boolean);
      bySentence.forEach((s) => fragments.push(s));
    });
    if (fragments.length === 0) fragments = [text];

    let pieces = [];
    fragments.forEach((frag) => {
      pieces.push(...splitByConnectors(frag));
    });

    let final = [];
    pieces.forEach((p) => final.push(...splitByMidTriggers(p)));

    final = final
      .map(cleanFragment)
      .filter((f) => f && f.replace(/[^a-zà-öø-ÿ]/gi, "").length > 1);

    final = final.filter((f, i) => f.toLowerCase() !== (final[i - 1] || "").toLowerCase());

    return final;
  }

  function splitByConnectors(text) {
    let result = [text];
    SPLIT_CONNECTORS.forEach((conn) => {
      const re = new RegExp(`\\s+${escapeRe(conn)}\\s+`, "gi");
      let next = [];
      result.forEach((chunk) => {
        next.push(...chunk.split(re));
      });
      result = next;
    });
    return result.map((s) => s.trim()).filter(Boolean);
  }

  function splitByMidTriggers(text) {
    const re = new RegExp(`\\b(${MIDSENTENCE_TRIGGERS.map(escapeRe).join("|")})\\b`, "gi");
    let match;
    let indices = [];
    while ((match = re.exec(text)) !== null) {
      if (match.index > 0) indices.push(match.index);
    }
    if (indices.length === 0) return [text];
    let parts = [];
    let last = 0;
    indices.forEach((idx) => {
      parts.push(text.slice(last, idx));
      last = idx;
    });
    parts.push(text.slice(last));
    return parts.map((s) => s.trim()).filter(Boolean);
  }

  function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function cleanFragment(f) {
    let s = f.trim();
    const sorted = [...LEAD_STRIP].sort((a, b) => b.length - a.length);
    let changed = true;
    let guard = 0;
    while (changed && guard < 5) {
      changed = false;
      guard++;
      for (const lead of sorted) {
        const re = new RegExp(`^${escapeRe(lead)}\\s+`, "i");
        if (re.test(s)) {
          s = s.replace(re, "");
          changed = true;
          break;
        }
      }
    }
    s = s.replace(/^[,;:\-\s]+/, "").replace(/[,;:\-\s]+$/, "");
    s = s.replace(/\s{2,}/g, " ").trim();
    if (!s) return "";
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // ---------- ADD TASKS (via review sheet) ----------
  let pendingReview = [];

  function openReview(candidateTexts) {
    pendingReview = candidateTexts.map((t) => ({ id: uid(), text: t }));
    if (pendingReview.length === 0) pendingReview = [{ id: uid(), text: "" }];
    renderReview();
    document.getElementById("sheet-backdrop").classList.add("show");
    document.getElementById("review-sheet").classList.add("show");
  }

  function closeReview() {
    document.getElementById("sheet-backdrop").classList.remove("show");
    document.getElementById("review-sheet").classList.remove("show");
  }

  function renderReview() {
    const list = document.getElementById("review-list");
    list.innerHTML = "";
    pendingReview.forEach((item) => {
      const row = document.createElement("div");
      row.className = "review-item";
      const input = document.createElement("input");
      input.type = "text";
      input.value = item.text;
      input.addEventListener("input", () => (item.text = input.value));
      const rm = document.createElement("button");
      rm.className = "review-item-remove";
      rm.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
      rm.addEventListener("click", () => {
        pendingReview = pendingReview.filter((p) => p.id !== item.id);
        renderReview();
      });
      row.appendChild(input);
      row.appendChild(rm);
      list.appendChild(row);
    });
  }

  document.getElementById("review-add-manual").addEventListener("click", () => {
    pendingReview.push({ id: uid(), text: "" });
    renderReview();
    const inputs = document.querySelectorAll("#review-list input");
    if (inputs.length) inputs[inputs.length - 1].focus();
  });

  document.getElementById("review-cancel").addEventListener("click", closeReview);
  document.getElementById("sheet-backdrop").addEventListener("click", () => {
    if (document.getElementById("review-sheet").classList.contains("show")) closeReview();
  });

  document.getElementById("review-confirm").addEventListener("click", () => {
    const catId = activeCategoryId === "all" ? "generale" : activeCategoryId;
    let added = 0;
    pendingReview.forEach((item) => {
      const text = item.text.trim();
      if (!text) return;
      state.sections[currentSection].tasks.push({
        id: uid(),
        text,
        categoryId: catId,
        completed: false,
        createdAt: Date.now(),
        completedAt: null,
      });
      added++;
    });
    saveState();
    closeReview();
    renderSection();
    if (added > 0) showToast(added === 1 ? "Attività aggiunta" : `${added} attività aggiunte`);
  });

  // ---------- TEXT INPUT ----------
  const textInput = document.getElementById("text-input");
  document.getElementById("send-btn").addEventListener("click", submitText);
  textInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitText();
  });

  function submitText() {
    const val = textInput.value.trim();
    if (!val) return;
    const tasks = parseTasksFromText(val);
    textInput.value = "";
    openReview(tasks);
  }

  // ---------- VOICE (Web Speech API — gratuito, nativo) ----------
  const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let finalTranscript = "";
  let listening = false;

  const overlay = document.getElementById("listening-overlay");
  const transcriptEl = document.getElementById("listening-transcript");

  function setupRecognition() {
    if (!SpeechRecognitionCtor) return null;
    const r = new SpeechRecognitionCtor();
    r.lang = "it-IT";
    r.continuous = true;
    r.interimResults = true;

    r.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) finalTranscript += res[0].transcript + " ";
        else interim += res[0].transcript;
      }
      transcriptEl.textContent = (finalTranscript + interim).trim();
    };

    r.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        showToast("Permesso microfono negato. Abilitalo nelle impostazioni.");
      } else if (event.error === "no-speech") {
        // ignora, l'utente può continuare a parlare o fermarsi
      } else {
        showToast("Il microfono ha avuto un problema. Riprova.");
      }
    };

    r.onend = () => {
      if (listening) {
        try { r.start(); } catch (e) {}
      }
    };

    return r;
  }

  function startListening() {
    if (!SpeechRecognitionCtor) {
      showToast("Il riconoscimento vocale non è supportato su questo browser.");
      return;
    }
    finalTranscript = "";
    transcriptEl.textContent = "";
    recognition = setupRecognition();
    try {
      recognition.start();
      listening = true;
      overlay.classList.add("show");
    } catch (e) {
      showToast("Impossibile avviare il microfono.");
    }
  }

  function stopListening() {
    listening = false;
    overlay.classList.remove("show");
    if (recognition) {
      try { recognition.stop(); } catch (e) {}
    }
    const text = finalTranscript.trim() || transcriptEl.textContent.trim();
    if (text) {
      const tasks = parseTasksFromText(text);
      openReview(tasks);
    }
  }

  document.getElementById("mic-btn").addEventListener("click", startListening);
  document.getElementById("stop-listening").addEventListener("click", stopListening);

  // ---------- TOAST ----------
  let toastTimer = null;
  function showToast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
  }

  // ---------- SERVICE WORKER ----------
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }

  // ---------- INIT ----------
  goHome();
})();
