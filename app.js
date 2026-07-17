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

  // Dopo quanti giorni un'attività attiva diventa "scaduta" (allarme rosso)
  const DAY_MS = 86400000;
  const AGING_DAYS = 5;
  const ageDays = (t) => Math.floor((Date.now() - t.createdAt) / DAY_MS);
  const isOverdue = (t) => !t.completed && Date.now() - t.createdAt >= AGING_DAYS * DAY_MS;
  const priorityOf = (t) => t.priority || "normale";

  // ---------- STATE ----------
  function defaultStats() {
    return {
      xp: { personale: 0, lavoro: 0 },
      completedTotal: { personale: 0, lavoro: 0 },
      streak: { current: 0, best: 0, lastDate: null },
      history: {}, // "yyyy-mm-dd": numero di completamenti quel giorno
    };
  }

  function defaultState() {
    return {
      sections: {
        personale: { categories: [{ id: "generale", name: "Generale" }], tasks: [] },
        lavoro: { categories: [{ id: "generale", name: "Generale" }], tasks: [] },
      },
      stats: defaultStats(),
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      if (!parsed.sections || !parsed.sections.personale || !parsed.sections.lavoro) return defaultState();
      // migrazione: assicura che il blocco statistiche esista e sia completo
      const d = defaultStats();
      parsed.stats = Object.assign(d, parsed.stats || {});
      parsed.stats.xp = Object.assign(d.xp, parsed.stats.xp || {});
      parsed.stats.completedTotal = Object.assign(d.completedTotal, parsed.stats.completedTotal || {});
      parsed.stats.streak = Object.assign(d.streak, parsed.stats.streak || {});
      parsed.stats.history = parsed.stats.history || {};
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
    renderGreeting();
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

  // ---------- NAVIGATION: REPORT ----------
  const viewReport = document.getElementById("view-report");

  function openReport() {
    renderReport();
    viewReport.classList.add("active");
    viewHome.classList.remove("active");
  }
  function closeReport() {
    viewReport.classList.remove("active");
    viewHome.classList.add("active");
    renderHome();
  }
  document.getElementById("open-report").addEventListener("click", openReport);
  document.getElementById("report-back").addEventListener("click", closeReport);
  document.getElementById("assistant-generate").addEventListener("click", generateAssistant);

  function sectionStats(key) {
    const tasks = state.sections[key].tasks;
    const active = tasks.filter((t) => !t.completed).length;
    const done = state.stats.completedTotal[key];
    const total = done + active;
    const rate = total > 0 ? Math.round((done / total) * 100) : 0;
    return { xp: state.stats.xp[key], level: levelInfo(state.stats.xp[key]).level, done, active, rate };
  }

  function renderReport() {
    const info = levelInfo(globalXp());
    document.getElementById("rp-level").textContent = info.level;
    document.getElementById("rp-rank").textContent = info.rank;
    document.getElementById("rp-bar").style.width = info.pct + "%";
    document.getElementById("rp-xp").textContent = info.into + " / " + info.need + " XP  ·  " + globalXp() + " totali";

    document.getElementById("rp-streak").textContent = effectiveStreak();
    document.getElementById("rp-best").textContent = state.stats.streak.best;
    document.getElementById("rp-today").textContent = state.stats.history[todayKey()] || 0;

    ["personale", "lavoro"].forEach((key) => {
      const s = sectionStats(key);
      document.getElementById(`rp-${key}-xp`).textContent = s.xp + " XP · Liv. " + s.level;
      document.getElementById(`rp-${key}-done`).textContent = s.done;
      document.getElementById(`rp-${key}-active`).textContent = s.active;
      document.getElementById(`rp-${key}-rate`).textContent = s.rate + "%";
    });

    // Grafico ultimi 7 giorni
    const wrap = document.getElementById("rp-week");
    wrap.innerHTML = "";
    const days = [];
    for (let i = 6; i >= 0; i--) days.push(Date.now() - i * DAY_MS);
    const counts = days.map((ms) => state.stats.history[dateKey(ms)] || 0);
    const max = Math.max(1, ...counts);
    const labels = ["D", "L", "M", "M", "G", "V", "S"];
    days.forEach((ms, i) => {
      const col = document.createElement("div");
      col.className = "week-col";
      const bar = document.createElement("div");
      bar.className = "week-bar" + (counts[i] > 0 ? " has" : "");
      bar.style.height = Math.round((counts[i] / max) * 100) + "%";
      if (counts[i] > 0) bar.title = counts[i] + " completate";
      const cap = document.createElement("span");
      cap.className = "week-cap";
      cap.textContent = counts[i] > 0 ? counts[i] : "";
      const lab = document.createElement("span");
      lab.className = "week-lab";
      lab.textContent = labels[new Date(ms).getDay()];
      const track = document.createElement("div");
      track.className = "week-track";
      track.appendChild(bar);
      col.appendChild(cap);
      col.appendChild(track);
      col.appendChild(lab);
      wrap.appendChild(col);
    });

    renderAssistant();
  }

  // ---------- ASSISTENTE AI (report intelligente) ----------
  let assistantBusy = false;

  function bulletList(arr, cls) {
    const ul = document.createElement("ul");
    ul.className = cls;
    (arr || []).forEach((x) => {
      if (!x) return;
      const li = document.createElement("li");
      li.textContent = String(x);
      ul.appendChild(li);
    });
    return ul;
  }

  function renderAssistant() {
    const btn = document.getElementById("assistant-generate");
    const empty = document.getElementById("assistant-empty");
    const body = document.getElementById("assistant-body");
    const meta = document.getElementById("assistant-meta");

    if (!aiEnabled()) {
      empty.textContent = "Attiva l'assistente AI dalle impostazioni ⚙️ per l'analisi personalizzata.";
      empty.style.display = "block";
      btn.style.display = "none";
      body.innerHTML = "";
      meta.textContent = "";
      return;
    }
    btn.style.display = "";
    btn.textContent = assistantBusy ? "Sto analizzando…" : state.aiReport ? "Aggiorna analisi" : "Genera analisi";
    btn.disabled = assistantBusy;

    const rep = state.aiReport && state.aiReport.report;
    if (!rep) {
      empty.textContent = assistantBusy ? "" : "Tocca “Genera analisi”: l'assistente esaminerà le tue attività e ti dirà come stai andando.";
      empty.style.display = assistantBusy ? "none" : "block";
      body.innerHTML = "";
      meta.textContent = "";
      return;
    }

    empty.style.display = "none";
    body.innerHTML = "";
    if (rep.saluto) {
      const h = document.createElement("p");
      h.className = "assistant-hi";
      h.textContent = rep.saluto;
      body.appendChild(h);
    }
    if (rep.panoramica) {
      const p = document.createElement("p");
      p.className = "assistant-text";
      p.textContent = rep.panoramica;
      body.appendChild(p);
    }
    if (rep.focusOggi && rep.focusOggi.length) {
      const t = document.createElement("p");
      t.className = "assistant-h";
      t.textContent = "🎯 Focus di oggi";
      body.appendChild(t);
      body.appendChild(bulletList(rep.focusOggi, "assistant-list focus"));
    }
    if (rep.osservazioni && rep.osservazioni.length) {
      const t = document.createElement("p");
      t.className = "assistant-h";
      t.textContent = "🔎 Osservazioni";
      body.appendChild(t);
      body.appendChild(bulletList(rep.osservazioni, "assistant-list"));
    }
    if (rep.suggerimenti && rep.suggerimenti.length) {
      const t = document.createElement("p");
      t.className = "assistant-h";
      t.textContent = "💡 Suggerimenti";
      body.appendChild(t);
      body.appendChild(bulletList(rep.suggerimenti, "assistant-list"));
    }
    const when = new Date(state.aiReport.at);
    meta.textContent = "Aggiornato alle " + when.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  }

  function generateAssistant() {
    if (assistantBusy || !aiEnabled()) return;
    assistantBusy = true;
    renderAssistant();
    callAIReport()
      .then((report) => {
        state.aiReport = { at: Date.now(), report };
        saveState();
      })
      .catch(() => {
        showToast("Assistente non raggiungibile. Riprova.");
      })
      .finally(() => {
        assistantBusy = false;
        renderAssistant();
      });
  }

  // ---------- ASSISTENTE "JARVIS": nome utente + saluto ----------
  const NAME_KEY = "todolist_user_name";
  const userName = () => (localStorage.getItem(NAME_KEY) || "Simone").trim() || "Simone";

  function greetingTime() {
    const h = new Date().getHours();
    if (h < 12) return "Buongiorno";
    if (h < 18) return "Buon pomeriggio";
    if (h < 23) return "Buonasera";
    return "Ancora sveglio";
  }

  function countActiveAll() {
    let active = 0, urgent = 0, overdue = 0;
    ["personale", "lavoro"].forEach((k) => {
      state.sections[k].tasks.forEach((t) => {
        if (t.completed) return;
        active++;
        if (priorityOf(t) === "urgente") urgent++;
        if (isOverdue(t)) overdue++;
      });
    });
    return { active, urgent, overdue };
  }

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  // Battute in stile J.A.R.V.I.S.: maggiordomo british, formale, umorismo secco
  function buildGreeting() {
    const name = userName();
    const { active, urgent, overdue } = countActiveAll();
    const hello = greetingTime() + ", " + name + ".";
    let status;
    if (active === 0) {
      status = pick([
        "Nessuna attività in sospeso. Un lusso raro, se posso permettermi.",
        "L'agenda è immacolata. Si goda pure il momento.",
        "Tutto sotto controllo: niente all'orizzonte.",
      ]);
    } else {
      let s = active === 1 ? "C'è 1 attività in agenda" : "Ci sono " + active + " attività in agenda";
      if (urgent > 0) s += urgent === 1 ? ", di cui 1 urgente" : ", di cui " + urgent + " urgenti";
      s += ".";
      if (overdue > 0) {
        s += " " + (overdue === 1 ? "Una attende" : overdue + " attendono") + " da giorni: mi permetto di segnalarlo. Con discrezione, s'intende.";
      } else {
        s += " " + pick(["Ai suoi ordini.", "Quando desidera, cominciamo.", "Sono operativo."]);
      }
      status = s;
    }
    return { hello, status };
  }

  let currentGreeting = { hello: "", status: "" };

  function renderGreeting() {
    currentGreeting = buildGreeting();
    document.getElementById("jarvis-hello").textContent = currentGreeting.hello;
    document.getElementById("jarvis-status").textContent = currentGreeting.status;
  }

  // Sceglie la voce italiana migliore disponibile sul dispositivo
  let cachedVoices = [];
  function refreshVoices() {
    if ("speechSynthesis" in window) cachedVoices = window.speechSynthesis.getVoices() || [];
  }
  if ("speechSynthesis" in window) {
    refreshVoices();
    window.speechSynthesis.onvoiceschanged = refreshVoices;
  }
  function bestItalianVoice() {
    const it = cachedVoices.filter((v) => /it/i.test(v.lang));
    if (!it.length) return null;
    const prefer = [/enhanced/i, /premium/i, /neural/i, /google/i, /siri/i, /alice/i, /federica/i, /luca/i, /elsa/i];
    for (const rx of prefer) {
      const m = it.find((v) => rx.test(v.name));
      if (m) return m;
    }
    return it[0];
  }

  // Voce nativa del dispositivo (fallback gratuito)
  function speakNative(text) {
    if (!("speechSynthesis" in window)) {
      showToast("Voce non supportata su questo browser.");
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = bestItalianVoice();
    if (v) u.voice = v;
    u.lang = "it-IT";
    u.rate = 0.96;
    u.pitch = 0.85; // leggermente più grave, tono da maggiordomo
    window.speechSynthesis.speak(u);
  }

  // J.A.R.V.I.S. che parla: voce neurale di Gemini se disponibile, altrimenti nativa
  let jarvisAudio = null;
  let speaking = false;
  const speakBtn = document.getElementById("jarvis-speak");

  function speakJarvis(text) {
    if (!text) return;
    if (!aiEnabled()) return speakNative(text);
    if (speaking) return;
    speaking = true;
    speakBtn.classList.add("loading");
    fetch(aiEndpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "speak", text }),
    })
      .then((r) => {
        if (!r.ok) throw new Error("tts http " + r.status);
        return r.json();
      })
      .then((d) => {
        if (!d || !d.audioWav) throw new Error("no audio");
        if (jarvisAudio) jarvisAudio.pause();
        if ("speechSynthesis" in window) window.speechSynthesis.cancel();
        jarvisAudio = new Audio("data:audio/wav;base64," + d.audioWav);
        return jarvisAudio.play();
      })
      .catch(() => {
        speakNative(text); // fallback alla voce del telefono
      })
      .finally(() => {
        speaking = false;
        speakBtn.classList.remove("loading");
      });
  }

  speakBtn.addEventListener("click", () => {
    speakJarvis(currentGreeting.hello + " " + currentGreeting.status);
  });

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

    // Barra punteggio in home
    const info = levelInfo(globalXp());
    document.getElementById("hs-level").textContent = info.level;
    document.getElementById("hs-rank").textContent = info.rank;
    document.getElementById("hs-xp").textContent = globalXp() + " XP";
    document.getElementById("hs-bar").style.width = info.pct + "%";
    document.getElementById("hs-streak").textContent = effectiveStreak();
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

    const active = filtered
      .filter((t) => !t.completed)
      .sort((a, b) => urgencyRank(b) - urgencyRank(a) || b.createdAt - a.createdAt);
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

  // Rango di urgenza: scadute in cima (più vecchie prima), poi per priorità
  function urgencyRank(t) {
    if (isOverdue(t)) return 1000 + ageDays(t);
    const p = priorityOf(t);
    return p === "urgente" ? 2 : p === "bassa" ? 0 : 1;
  }

  function makePill(label, className) {
    const s = document.createElement("span");
    s.className = className;
    s.textContent = label;
    return s;
  }

  function renderTaskItem(task) {
    const prio = priorityOf(task);
    const overdue = isOverdue(task);

    const el = document.createElement("div");
    el.className =
      "task-item prio-" + prio + (task.completed ? " done" : "") + (overdue ? " overdue" : "");
    el.dataset.id = task.id;

    const check = document.createElement("button");
    check.className = "task-check";
    check.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    check.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleTask(task.id);
    });

    const body = document.createElement("div");
    body.className = "task-body";
    const text = document.createElement("div");
    text.className = "task-text";
    text.textContent = task.text;
    body.appendChild(text);

    const meta = document.createElement("div");
    meta.className = "task-meta";
    meta.appendChild(makePill(categoryName(task.categoryId), "task-cat"));
    if (!task.completed && prio === "urgente") meta.appendChild(makePill("Urgente", "task-prio urgente"));
    else if (!task.completed && prio === "bassa") meta.appendChild(makePill("Bassa", "task-prio bassa"));
    if (overdue) {
      const n = ageDays(task);
      meta.appendChild(makePill("⏰ Da " + n + " giorni", "task-flag"));
    }
    body.appendChild(meta);

    // Tocca il corpo dell'attività per modificarla
    body.addEventListener("click", () => openEditSheet(task.id));

    const del = document.createElement("button");
    del.className = "task-delete";
    del.setAttribute("aria-label", "Elimina");
    del.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    del.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteTask(task.id);
    });

    el.appendChild(check);
    el.appendChild(body);
    el.appendChild(del);
    return el;
  }

  // ---------- GAMIFICATION (punti, livelli, streak) ----------
  const XP_PER_LEVEL = 100;
  const RANKS = [
    { min: 1, name: "Novizio" },
    { min: 3, name: "Apprendista" },
    { min: 6, name: "Esperto" },
    { min: 10, name: "Maestro" },
    { min: 16, name: "Campione" },
    { min: 25, name: "Leggenda" },
  ];

  function levelInfo(xp) {
    const level = Math.floor(xp / XP_PER_LEVEL) + 1;
    const into = xp % XP_PER_LEVEL;
    let rank = RANKS[0].name;
    for (const r of RANKS) if (level >= r.min) rank = r.name;
    return { level, into, need: XP_PER_LEVEL, pct: Math.round((into / XP_PER_LEVEL) * 100), rank };
  }

  const globalXp = () => state.stats.xp.personale + state.stats.xp.lavoro;
  const dateKey = (ms) => {
    const d = new Date(ms);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  };
  const todayKey = () => dateKey(Date.now());

  // Streak "effettivo": vale solo se l'ultimo giorno è oggi o ieri
  function effectiveStreak() {
    const s = state.stats.streak;
    if (!s.lastDate) return 0;
    if (s.lastDate === todayKey() || s.lastDate === dateKey(Date.now() - DAY_MS)) return s.current;
    return 0;
  }

  function updateStreakOnComplete() {
    const s = state.stats.streak;
    const today = todayKey();
    if (s.lastDate === today) return; // già contato oggi
    const yesterday = dateKey(Date.now() - DAY_MS);
    s.current = s.lastDate === yesterday ? s.current + 1 : 1;
    s.lastDate = today;
    if (s.current > s.best) s.best = s.current;
  }

  function xpForTask(t) {
    let xp = 10; // base
    if (priorityOf(t) === "urgente") xp += 10; // urgenti valgono di più
    if (!isOverdue(t) && Date.now() - t.createdAt < DAY_MS) xp += 5; // bonus "in giornata"
    return xp;
  }

  function toggleTask(id) {
    const t = state.sections[currentSection].tasks.find((t) => t.id === id);
    if (!t) return;

    if (!t.completed) {
      // ---- COMPLETAMENTO: assegna punti ----
      const beforeLevel = levelInfo(globalXp()).level;
      t.completed = true;
      t.completedAt = Date.now();
      const gained = xpForTask(t);
      t.xpAwarded = gained;
      state.stats.xp[currentSection] += gained;
      state.stats.completedTotal[currentSection] += 1;
      const d = todayKey();
      state.stats.history[d] = (state.stats.history[d] || 0) + 1;
      updateStreakOnComplete();
      saveState();
      renderSection();
      showXpPop(gained);
      const afterLevel = levelInfo(globalXp()).level;
      if (afterLevel > beforeLevel) {
        setTimeout(() => showToast("🎉 Livello " + afterLevel + " — " + levelInfo(globalXp()).rank + "!"), 700);
      }
    } else {
      // ---- ANNULLAMENTO: restituisci i punti ----
      t.completed = false;
      const refund = t.xpAwarded || 0;
      state.stats.xp[currentSection] = Math.max(0, state.stats.xp[currentSection] - refund);
      state.stats.completedTotal[currentSection] = Math.max(0, state.stats.completedTotal[currentSection] - 1);
      const d = todayKey();
      if (state.stats.history[d]) state.stats.history[d] = Math.max(0, state.stats.history[d] - 1);
      t.xpAwarded = 0;
      t.completedAt = null;
      saveState();
      renderSection();
    }
  }

  // Popup "+XP" stile videogioco
  function showXpPop(amount) {
    const el = document.getElementById("xp-pop");
    el.textContent = "+" + amount + " XP";
    el.classList.remove("show");
    // forza il restart dell'animazione
    void el.offsetWidth;
    el.classList.add("show");
  }

  function deleteTask(id) {
    const arr = state.sections[currentSection].tasks;
    const idx = arr.findIndex((t) => t.id === id);
    if (idx > -1) arr.splice(idx, 1);
    saveState();
    renderSection();
  }

  // ---------- EDIT TASK (modifica testo / priorità / categoria) ----------
  const editBackdrop = document.getElementById("edit-backdrop");
  const editSheet = document.getElementById("edit-sheet");
  const editInput = document.getElementById("edit-input");
  const editPriorityWrap = document.getElementById("edit-priority");
  const editCategoryWrap = document.getElementById("edit-category");

  let editingId = null;
  let editPriority = "normale";
  let editCategoryId = "generale";

  function renderPriorityPicker() {
    editPriorityWrap.querySelectorAll(".prio-opt").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.prio === editPriority);
    });
  }

  function renderEditCategoryPicker() {
    editCategoryWrap.innerHTML = "";
    state.sections[currentSection].categories.forEach((c) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cat-chip" + (editCategoryId === c.id ? " active" : "");
      btn.textContent = c.name;
      btn.addEventListener("click", () => {
        editCategoryId = c.id;
        renderEditCategoryPicker();
      });
      editCategoryWrap.appendChild(btn);
    });
  }

  editPriorityWrap.querySelectorAll(".prio-opt").forEach((btn) => {
    btn.addEventListener("click", () => {
      editPriority = btn.dataset.prio;
      renderPriorityPicker();
    });
  });

  function openEditSheet(id) {
    const t = state.sections[currentSection].tasks.find((x) => x.id === id);
    if (!t) return;
    editingId = id;
    editInput.value = t.text;
    editPriority = priorityOf(t);
    editCategoryId = t.categoryId || "generale";
    renderPriorityPicker();
    renderEditCategoryPicker();
    editBackdrop.classList.add("show");
    editSheet.classList.add("show");
    setTimeout(() => editInput.focus(), 300);
  }

  function closeEditSheet() {
    editingId = null;
    editBackdrop.classList.remove("show");
    editSheet.classList.remove("show");
  }

  function saveEdit() {
    const t = state.sections[currentSection].tasks.find((x) => x.id === editingId);
    if (!t) return closeEditSheet();
    const newText = editInput.value.trim();
    if (newText) t.text = newText;
    t.priority = editPriority;
    t.categoryId = editCategoryId;
    saveState();
    closeEditSheet();
    renderSection();
    showToast("Attività aggiornata");
  }

  document.getElementById("edit-save").addEventListener("click", saveEdit);
  editInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") saveEdit();
  });
  document.getElementById("edit-delete").addEventListener("click", () => {
    const id = editingId;
    closeEditSheet();
    if (id) deleteTask(id);
  });
  editBackdrop.addEventListener("click", () => {
    if (editSheet.classList.contains("show")) closeEditSheet();
  });

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
  const PRIO_ORDER = ["urgente", "normale", "bassa"];
  const PRIO_LABEL = { urgente: "Urgente", normale: "Normale", bassa: "Bassa" };

  // Normalizza sia stringhe (parser locale) sia oggetti {text, priority} (AI)
  function toReviewItem(x) {
    if (typeof x === "string") return { id: uid(), text: x, priority: "normale" };
    return { id: uid(), text: x.text || "", priority: PRIO_ORDER.includes(x.priority) ? x.priority : "normale" };
  }

  function openReview(candidates, meta) {
    meta = meta || {};
    pendingReview = (candidates || []).map((c) => {
      const it = toReviewItem(c);
      it.source = meta.source || "manuale";
      it.rawText = meta.rawText || "";
      return it;
    });
    if (pendingReview.length === 0)
      pendingReview = [{ id: uid(), text: "", priority: "normale", source: "manuale", rawText: "" }];
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

      // Pallino priorità: si tocca per cambiarla (urgente → normale → bassa)
      const prio = document.createElement("button");
      prio.className = "review-prio prio-" + item.priority;
      prio.title = PRIO_LABEL[item.priority];
      prio.setAttribute("aria-label", "Priorità: " + PRIO_LABEL[item.priority]);
      prio.addEventListener("click", () => {
        const next = (PRIO_ORDER.indexOf(item.priority) + 1) % PRIO_ORDER.length;
        item.priority = PRIO_ORDER[next];
        prio.className = "review-prio prio-" + item.priority;
        prio.title = PRIO_LABEL[item.priority];
      });

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
      row.appendChild(prio);
      row.appendChild(input);
      row.appendChild(rm);
      list.appendChild(row);
    });
  }

  document.getElementById("review-add-manual").addEventListener("click", () => {
    pendingReview.push({ id: uid(), text: "", priority: "normale", source: "manuale", rawText: "" });
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
        priority: PRIO_ORDER.includes(item.priority) ? item.priority : "normale",
        completed: false,
        createdAt: Date.now(),
        completedAt: null,
        source: item.source || "manuale",
        rawText: item.rawText || "",
      });
      added++;
    });
    saveState();
    closeReview();
    renderSection();
    if (added > 0) showToast(added === 1 ? "Attività aggiunta" : `${added} attività aggiunte`);
  });

  // ---------- AI (Google Gemini via Cloudflare Worker) ----------
  const AI_ENDPOINT_KEY = "todolist_ai_endpoint";
  const aiEndpoint = () => (localStorage.getItem(AI_ENDPOINT_KEY) || "").trim();
  const aiEnabled = () => /^https?:\/\//i.test(aiEndpoint());

  function showAiLoading(on) {
    document.getElementById("ai-loading").classList.toggle("show", on);
  }

  async function callAI(text) {
    const res = await fetch(aiEndpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error("AI HTTP " + res.status);
    const data = await res.json();
    if (!data || !Array.isArray(data.tasks)) throw new Error("Risposta AI non valida");
    return data.tasks.filter((t) => t && typeof t.text === "string" && t.text.trim());
  }

  // Raccoglie tutto il contesto (quando/come/cosa/perché) per l'assistente
  function buildReportPayload() {
    const now = Date.now();
    const rel = (ms) => (ms ? Math.round(((now - ms) / DAY_MS) * 10) / 10 : null); // giorni fa
    const sezioni = {};
    ["personale", "lavoro"].forEach((key) => {
      const secTasks = state.sections[key].tasks;
      const cats = {};
      state.sections[key].categories.forEach((c) => (cats[c.id] = c.name));
      const map = (t) => ({
        testo: t.text,
        priorita: priorityOf(t),
        categoria: cats[t.categoryId] || "Generale",
        inseritaGiorniFa: rel(t.createdAt),
        origine: t.source || "sconosciuta",
        fraseOriginale: t.rawText || null,
        inRitardo: isOverdue(t),
        completataGiorniFa: t.completed ? rel(t.completedAt) : null,
      });
      const active = secTasks.filter((t) => !t.completed).map(map);
      const completed = secTasks
        .filter((t) => t.completed)
        .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0))
        .slice(0, 12)
        .map(map);
      sezioni[key] = {
        xp: state.stats.xp[key],
        completateTotali: state.stats.completedTotal[key],
        attive: active,
        completateRecenti: completed,
      };
    });
    return {
      nome: userName(),
      oggi: new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" }),
      livello: levelInfo(globalXp()).level,
      rango: levelInfo(globalXp()).rank,
      xpTotali: globalXp(),
      streakGiorni: effectiveStreak(),
      recordStreak: state.stats.streak.best,
      completateOggi: state.stats.history[todayKey()] || 0,
      sezioni,
    };
  }

  async function callAIReport() {
    const res = await fetch(aiEndpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "report", payload: buildReportPayload() }),
    });
    if (!res.ok) throw new Error("AI HTTP " + res.status);
    const data = await res.json();
    if (!data || !data.report) throw new Error("Report non valido");
    return data.report;
  }

  // Punto unico di ingresso: usa l'AI se configurata, altrimenti il parser locale.
  function processInput(text, source) {
    const val = (text || "").trim();
    if (!val) return;
    const meta = { source: source || "testo", rawText: val };
    if (!aiEnabled()) {
      openReview(parseTasksFromText(val), meta);
      return;
    }
    showAiLoading(true);
    callAI(val)
      .then((tasks) => {
        showAiLoading(false);
        openReview(tasks.length ? tasks : parseTasksFromText(val), meta);
      })
      .catch(() => {
        showAiLoading(false);
        showToast("AI non raggiungibile: uso l'analisi locale");
        openReview(parseTasksFromText(val), meta);
      });
  }

  // ---------- TEXT INPUT ----------
  const textInput = document.getElementById("text-input");
  document.getElementById("send-btn").addEventListener("click", submitText);
  textInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitText();
  });

  function submitText() {
    const val = textInput.value.trim();
    if (!val) return;
    textInput.value = "";
    processInput(val, "testo");
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
    if (text) processInput(text, "voce");
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

  // ---------- SETTINGS (endpoint AI) ----------
  const setBackdrop = document.getElementById("settings-backdrop");
  const setSheet = document.getElementById("settings-sheet");
  const setInput = document.getElementById("settings-ai-input");
  const setStatus = document.getElementById("settings-ai-status");

  function refreshAiStatus() {
    if (aiEnabled()) {
      setStatus.textContent = "● AI attiva";
      setStatus.className = "ai-status on";
    } else {
      setStatus.textContent = "○ AI non configurata (uso analisi locale)";
      setStatus.className = "ai-status off";
    }
  }

  const setNameInput = document.getElementById("settings-name-input");

  function openSettings() {
    setNameInput.value = userName();
    setInput.value = aiEndpoint();
    refreshAiStatus();
    setBackdrop.classList.add("show");
    setSheet.classList.add("show");
  }
  function closeSettings() {
    setBackdrop.classList.remove("show");
    setSheet.classList.remove("show");
  }
  document.getElementById("btn-settings").addEventListener("click", openSettings);
  document.getElementById("settings-cancel").addEventListener("click", closeSettings);
  setBackdrop.addEventListener("click", () => {
    if (setSheet.classList.contains("show")) closeSettings();
  });
  document.getElementById("settings-save").addEventListener("click", () => {
    const url = setInput.value.trim();
    if (url && !/^https?:\/\//i.test(url)) {
      showToast("Inserisci un URL valido (https://...)");
      return;
    }
    const name = setNameInput.value.trim();
    localStorage.setItem(NAME_KEY, name);
    localStorage.setItem(AI_ENDPOINT_KEY, url);
    refreshAiStatus();
    closeSettings();
    renderGreeting();
    showToast(url ? "Impostazioni salvate · AI attiva" : "Impostazioni salvate");
  });

  // ---------- SERVICE WORKER ----------
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }

  // ---------- INIT ----------
  goHome();
})();
