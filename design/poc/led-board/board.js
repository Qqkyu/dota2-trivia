// Queue Arcade — LED ribbon-board proof of concept.
// Demo logic only: the crowd, the room count, and the scores are synthetic.

(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const pad = (n) => String(Math.max(0, n)).padStart(2, "0");
  const CDN = "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react";
  const DOTA = document.body.classList.contains("skin-dota");
  const ATTRIBUTE_GROUPS = [["str", "Strength", "hero_strength"], ["agi", "Agility", "hero_agility"], ["int", "Intelligence", "hero_intelligence"], ["all", "Universal", "hero_universal"]];
  const streakName = (streak) => (streak >= 10 ? "Beyond Godlike" : streak >= 9 ? "Godlike" : streak >= 8 ? "Monster Kill" : streak >= 7 ? "Wicked Sick" : streak >= 6 ? "Unstoppable" : streak >= 5 ? "Mega Kill" : streak >= 4 ? "Dominating" : streak >= 3 ? "Killing Spree" : "");

  // ---------------------------------------------------------------- fascia
  function initFascia() {
    const body = document.body;
    const mute = $(".mute");
    const volume = $(".volume");
    let level = 7;
    if (volume) {
      volume.innerHTML = Array.from({ length: 10 }, (_, i) => `<i data-level="${i + 1}"></i>`).join("") + `<span class="pct">70%</span>`;
      const paint = () => {
        $$("i", volume).forEach((cell, i) => cell.classList.toggle("lit", i < level));
        $(".pct", volume).textContent = `${level * 10}%`;
        volume.setAttribute("aria-valuenow", String(level * 10));
      };
      volume.addEventListener("click", (event) => {
        const cell = event.target.closest("i");
        if (!cell) return;
        level = Number(cell.dataset.level);
        body.classList.remove("muted");
        mute?.setAttribute("aria-pressed", "false");
        paint();
      });
      paint();
    }
    mute?.addEventListener("click", () => {
      const muted = body.classList.toggle("muted");
      mute.setAttribute("aria-pressed", String(muted));
    });
    volume?.addEventListener("keydown", (event) => {
      const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, Home: -10, End: 10 }[event.key];
      if (step === undefined) return;
      event.preventDefault();
      level = Math.min(10, Math.max(0, level + step));
      body.classList.remove("muted");
      mute?.setAttribute("aria-pressed", "false");
      $$("i", volume).forEach((cell, i) => cell.classList.toggle("lit", i < level));
      $(".pct", volume).textContent = `${level * 10}%`;
      volume.setAttribute("aria-valuenow", String(level * 10));
    });
    const ticker = $(".ticker");
    const track = $(".ticker-track");
    if (track) {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        // No scrolling: step through the items in place, one instant swap at a time.
        ticker.classList.add("stepped");
        const items = $$(".item", track);
        let on = 0;
        items[0].classList.add("on");
        setInterval(() => {
          items[on].classList.remove("on");
          on = (on + 1) % items.length;
          items[on].classList.add("on");
        }, 4000);
      } else {
        track.innerHTML += track.innerHTML; // seamless loop
      }
    }
  }

  // ---------------------------------------------------------------- clock
  function paintClock(seconds, total) {
    const clock = $("#clock");
    const bar = $("#timebar");
    if (clock) clock.textContent = `00:${pad(seconds)}`;
    if (bar) {
      if (!bar.children.length) bar.innerHTML = Array.from({ length: 15 }, () => "<i></i>").join("");
      const lit = total ? Math.round((seconds / total) * 15) : seconds;
      $$("i", bar).forEach((cell, i) => cell.classList.toggle("lit", i < lit));
    }
  }

  // ---------------------------------------------------------------- lobby
  function initLobby() {
    const formats = $$(".fixtures .row");
    let start = Date.now();
    let index = 0;
    const tick = () => {
      const elapsed = (Date.now() - start) / 1000;
      const left = Math.max(0, Math.ceil(15 - elapsed));
      paintClock(left, 15);
      if (elapsed >= 15) {
        start = Date.now();
        index = (index + 1) % formats.length;
        formats.forEach((row, i) => {
          row.classList.toggle("now", i === index);
          row.classList.toggle("next", i === (index + 1) % formats.length);
          $(".slot", row).textContent = i === index ? "Now" : i === (index + 1) % formats.length ? "Next" : "Rotation";
        });
      }
    };
    tick();
    setInterval(tick, 250);
  }

  // ---------------------------------------------------------------- play
  const ROUND = 15;
  const REVEAL = 8;
  const ENTRY = 3;

  const rounds = [
    {
      format: "classic",
      number: 212,
      label: "Classic Trivia",
      category: "Items",
      prompt: "How much does Blink Dagger cost?",
      art: `${CDN}/items/blink.png`,
      artAlt: "Blink Dagger item icon",
      ticket: ["Patch 7.41f", "Valve public data", "Total shop price"],
      answers: ["2,250 gold", "1,775 gold", "2,600 gold", "2,875 gold"],
      correct: 0,
      explanation: "Blink Dagger costs 2,250 gold in patch 7.41f.",
      split: [31, 44, 15, 10],
      players: 41,
    },
    {
      format: "fogged",
      number: 213,
      label: "Fogged Vision",
      category: "Heroes",
      prompt: "Which hero is hidden in the fog?",
      art: `${CDN}/heroes/abaddon.png`,
      artAlt: "A hero portrait behind fog",
      ticket: ["Patch 7.41f", "Valve hero data", "Fog clears in three stages"],
      hero: "abaddon",
      explanation: "Abaddon was hiding behind the fog.",
      split: [["abaddon", 58], ["sven", 17], ["tidehunter", 12], ["night_stalker", 6]],
      players: 41,
    },
  ];

  const state = { index: 0, phase: "entry", phaseStart: 0, pick: null, pickAt: null, points: 1240, streak: 3, rounds: 7, best: 9 };

  function heroName(slug) {
    const hero = (window.HEROES || []).find((h) => h.slug === slug);
    return hero ? hero.name : slug;
  }

  function dots(percent) {
    return Array.from({ length: 100 }, (_, i) => `<i${i < percent ? ' class="lit"' : ""}></i>`).join("");
  }

  function setClockState(text) {
    const el = $("#clockState");
    if (el) el.textContent = text;
  }

  function buildHeroGrid() {
    const grid = $("#heroGrid");
    if (!grid || grid.children.length) return;
    const tile = (h) => `<button type="button" data-slug="${h.slug}" data-attr="${h.attr || ""}" title="${h.name}" aria-label="${h.name}"><img src="${CDN}/heroes/crops/${h.slug}.png" alt="" loading="lazy" width="52" height="68"></button>`;
    const heroes = window.HEROES || [];
    grid.innerHTML = DOTA
      ? ATTRIBUTE_GROUPS.map(([key, label, icon]) => `<section class="attr-group" data-attr="${key}"><h3><img src="${CDN}/icons/${icon}.png" alt="" width="18" height="18">${label}</h3><div class="tiles">${heroes.filter((h) => h.attr === key).map(tile).join("")}</div></section>`).join("")
      : heroes.map(tile).join("");
    if (DOTA && !$(".attr-jump")) {
      grid.insertAdjacentHTML("beforebegin", `<div class="attr-jump" role="group" aria-label="Jump to attribute">${ATTRIBUTE_GROUPS.map(([key, label, icon]) => `<button type="button" data-attr="${key}" aria-label="${label}"><img src="${CDN}/icons/${icon}.png" alt="" width="16" height="16"><span>${label}</span></button>`).join("")}</div>`);
      $(".attr-jump").addEventListener("click", (event) => {
        const button = event.target.closest("button");
        if (!button) return;
        const section = $(`.attr-group[data-attr="${button.dataset.attr}"]`, grid);
        if (section) grid.scrollTo({ top: section.offsetTop - grid.offsetTop, behavior: "auto" });
      });
    }
    grid.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (button) pickHero(button.dataset.slug);
    });
    const search = $("#heroSearch");
    search?.addEventListener("input", () => {
      const q = search.value.trim().toLowerCase();
      $$("button", grid).forEach((b) => b.classList.toggle("hidden", q !== "" && !b.title.toLowerCase().includes(q)));
    });
    search?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      const visible = $$("button:not(.hidden)", grid);
      if (visible.length === 1) pickHero(visible[0].dataset.slug);
    });
  }

  function renderRound() {
    const round = rounds[state.index];
    const body = document.body;
    body.classList.remove("format-classic", "format-fogged");
    body.classList.add(`format-${round.format}`);
    $("#roundNumber").textContent = String(round.number);
    $("#roundFormat").textContent = round.label;
    $("#roundCategory").textContent = round.category;
    $("#prompt").textContent = round.prompt;
    const art = $("#art");
    art.src = round.art;
    art.alt = round.artAlt;
    $("#ticket").innerHTML = round.ticket.map((t, i) => `${i ? '<i class="led"></i>' : ""}<span>${t}</span>`).join("");
    $("#verdict").innerHTML = "";
    if (round.format === "classic") {
      $$(".cell").forEach((cell, i) => {
        cell.className = "cell";
        cell.disabled = false;
        $(".label", cell).textContent = round.answers[i];
        $(".pct", cell).textContent = `${round.split[i]}%`;
        $(".dots", cell).innerHTML = dots(round.split[i]);
        $(".sub", cell).textContent = "";
      });
    } else {
      buildHeroGrid();
      const grid = $("#heroGrid");
      $$("button", grid).forEach((b) => (b.className = ""));
      const search = $("#heroSearch");
      search.value = "";
      search.disabled = false;
      $("#heroStatus").innerHTML = '<i class="led"></i><span>Type a hero name. Enter picks the only match.</span>';
      $("#fogArt").dataset.fog = "3";
      $$("#fogStage i").forEach((cell, i) => cell.classList.toggle("lit", i === 0));
      const rows = $$("#fogSplit .row");
      round.split.forEach(([slug, pct], i) => {
        const row = rows[i];
        row.className = "row";
        row.dataset.attr = ((window.HEROES || []).find((h) => h.slug === slug) || {}).attr || "";
        $("img", row).src = `${CDN}/heroes/crops/${slug}.png`;
        $(".name", row).textContent = heroName(slug);
        $(".pct", row).textContent = `${pct}%`;
        $(".dots", row).innerHTML = dots(pct);
      });
    }
  }

  function setPhase(phase) {
    const body = document.body;
    body.classList.remove("phase-entry", "phase-answering", "phase-reveal", "locked", "result-right", "result-wrong", "result-missed", "flash-right", "flash-wrong", "flash-missed");
    body.classList.add(`phase-${phase}`);
    state.phase = phase;
    state.phaseStart = Date.now();
    const round = rounds[state.index];
    if (phase === "entry") {
      state.pick = null;
      state.pickAt = null;
      renderRound();
      $("#prompt").textContent = `Next: ${round.label}`;
      setClockState("Next round");
      $("#clockState").classList.remove("banner");
      if (DOTA) { $("#hudRadiant").textContent = "–"; $("#hudDire").textContent = "–"; $("#dial")?.style.setProperty("--turn", "0deg"); const f = $("#pointsFloat"); if (f) f.textContent = ""; }
      $$(".cell").forEach((cell) => (cell.disabled = true));
    }
    if (phase === "answering") {
      $("#prompt").textContent = round.prompt;
      setClockState("Answer now");
      $$(".cell").forEach((cell) => (cell.disabled = false));
      $("#heroSearch")?.focus({ preventScroll: true });
    }
    if (phase === "reveal") reveal();
  }

  function lock(label) {
    const left = Math.max(0, ROUND - (Date.now() - state.phaseStart) / 1000);
    state.pickAt = left;
    document.body.classList.add("locked");
    setClockState(`Locked at 00:${pad(Math.ceil(left))}`);
    return label;
  }

  function pickAnswer(index) {
    if (state.phase !== "answering" || state.pick !== null) return;
    state.pick = index;
    const cell = $$(".cell")[index];
    cell.classList.add("picked");
    $$(".cell").forEach((c) => (c.disabled = true));
    lock();
    $(".sub", cell).textContent = `Locked 00:${pad(Math.ceil(state.pickAt))}`;
  }

  function pickHero(slug) {
    if (state.phase !== "answering" || state.pick !== null) return;
    state.pick = slug;
    const grid = $("#heroGrid");
    $$("button", grid).forEach((b) => b.classList.toggle("picked", b.dataset.slug === slug));
    $("#heroSearch").disabled = true;
    lock();
    $("#heroStatus").innerHTML = `<i class="led"></i><span>Locked: ${heroName(slug)} at 00:${pad(Math.ceil(state.pickAt))}</span>`;
  }

  function reveal() {
    const round = rounds[state.index];
    const body = document.body;
    let right = false;
    let majorityWrong = false;
    let majorityLabel = "";
    if (round.format === "classic") {
      right = state.pick === round.correct;
      const top = round.split.indexOf(Math.max(...round.split));
      majorityWrong = top !== round.correct;
      majorityLabel = round.answers[top];
      $$(".cell").forEach((cell, i) => {
        cell.disabled = true;
        if (i === round.correct) cell.classList.add("correct");
        if (i === state.pick && !right) cell.classList.add("wrong");
        if (i === round.correct && right && majorityWrong) cell.classList.add("breaker");
      });
    } else {
      right = state.pick === round.hero;
      const top = round.split[0];
      majorityWrong = top[0] !== round.hero;
      majorityLabel = heroName(top[0]);
      $("#fogArt").dataset.fog = "0";
      $$("#heroGrid button").forEach((b) => {
        if (b.dataset.slug === round.hero) b.classList.add("correct");
        if (b.dataset.slug === state.pick && !right) b.classList.add("wrong");
      });
      $$("#fogSplit .row").forEach((row, i) => {
        if (round.split[i][0] === round.hero) row.classList.add("correct");
        else if (round.split[i][0] === state.pick) row.classList.add("wrong");
      });
      $("#fogSplit h2").textContent = `Room split · ${round.players} answers`;
      $("#heroStatus").innerHTML = `<i class="led"></i><span>${right ? "Right" : state.pick ? "Wrong" : "No answer"}: ${heroName(round.hero)} was in the fog</span>`;
    }

    const rightShare = round.format === "classic" ? round.split[round.correct] : (round.split.find(([slug]) => slug === round.hero) || [null, 0])[1];
    if (DOTA) { $("#hudRadiant").textContent = `${rightShare}%`; $("#hudDire").textContent = `${100 - rightShare}%`; $("#dial")?.style.setProperty("--turn", "180deg"); }
    const result = state.pick === null ? "missed" : right ? "right" : "wrong";
    body.classList.add(`result-${result}`, `flash-${result}`);
    setTimeout(() => body.classList.remove(`flash-${result}`), 700);

    let gained = 0;
    if (right) {
      const speed = Math.round((state.pickAt / ROUND) * 100);
      gained = 100 + speed;
      if (majorityWrong) gained *= 2;
      state.streak += 1;
      state.best = Math.max(state.best, state.streak);
    } else {
      state.streak = 0;
    }
    state.points += gained;
    state.rounds += 1;
    paintScore();
    if (DOTA) { const f = $("#pointsFloat"); if (f) f.textContent = gained ? `+${gained}` : ""; }

    const verdict = $("#verdict");
    const crowd = majorityWrong
      ? `Most of the room picked <strong>${majorityLabel}</strong>.`
      : `Most of the room got it right.`;
    const you =
      result === "missed"
        ? "No answer locked."
        : right
          ? `You locked it at <span class="num">00:${pad(Math.ceil(state.pickAt))}</span> for <span class="num">+${gained}</span>${majorityWrong ? " with the 2x crowd-breaker" : ""}.`
          : "Streak reset.";
    verdict.innerHTML = `<span class="copy"><strong>${round.explanation}</strong> ${crowd} ${you}</span>`;
    const callout = right ? streakName(state.streak) : "";
    setClockState(callout || (result === "right" ? "Right" : result === "wrong" ? "Wrong" : "Missed"));
    $("#clockState").classList.toggle("banner", Boolean(callout));
  }

  function paintScore() {
    $("#points").textContent = state.points.toLocaleString("en-US");
    $("#streak").textContent = String(state.streak);
    const name = $("#streakName");
    if (name) name.textContent = streakName(state.streak);
    $("#roundsPlayed").textContent = String(state.rounds);
    $("#best").textContent = String(state.best);
  }

  function initPlay() {
    buildHeroGrid();
    paintScore();
    $$(".cell").forEach((cell, i) => cell.addEventListener("click", () => pickAnswer(i)));
    document.addEventListener("keydown", (event) => {
      if (event.target.matches("input")) return;
      const index = ["a", "b", "c", "d"].indexOf(event.key.toLowerCase());
      if (index >= 0 && rounds[state.index].format === "classic") pickAnswer(index);
    });
    setPhase("entry");
    const tick = () => {
      const elapsed = (Date.now() - state.phaseStart) / 1000;
      if (state.phase === "entry") {
        paintClock(Math.ceil(ENTRY - elapsed), ENTRY);
        if (elapsed >= ENTRY) setPhase("answering");
      } else if (state.phase === "answering") {
        const left = Math.ceil(ROUND - elapsed);
        paintClock(left, ROUND);
        if (DOTA) {
          $("#dial")?.style.setProperty("--turn", `${Math.min(90, (elapsed / ROUND) * 90)}deg`);
          if (state.pick !== null && rounds[state.index].format === "classic") {
            const cd = $(".cd", $$(".cell")[state.pick]);
            cd.style.setProperty("--cd", String(Math.max(0, ROUND - elapsed) / ROUND));
          }
        }
        if (rounds[state.index].format === "fogged") {
          const stage = left > 10 ? 3 : left > 5 ? 2 : 1;
          $("#fogArt").dataset.fog = String(stage);
          $$("#fogStage i").forEach((cell, i) => cell.classList.toggle("lit", i < 4 - stage));
        }
        if (elapsed >= ROUND) setPhase("reveal");
      } else if (state.phase === "reveal") {
        paintClock(Math.ceil(REVEAL - elapsed), REVEAL);
        if (elapsed >= REVEAL) {
          state.index = (state.index + 1) % rounds.length;
          setPhase("entry");
        }
      }
    };
    setInterval(tick, 200);
  }

  document.addEventListener("DOMContentLoaded", () => {
    initFascia();
    if (document.body.classList.contains("lobby")) initLobby();
    if (document.body.classList.contains("play")) initPlay();
  });
})();
