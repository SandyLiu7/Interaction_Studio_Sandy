// main.js
// BoS module only runs inside /BoS/ pages (data-bos attribute)
// - Start: floating shuffled keyword buttons, visited marks, reset on start only
// - Fragment: auto-save pasted story text by code (01-12)
// - Puzzle: 60% unlock, 3-fail hints, reconstruct full story from saved fragments
// Does not affect CR/FG pages.

(function () {
  // ---------- helpers ----------
  function safeParse(str, fallback) {
    try { return JSON.parse(str); } catch (e) { return fallback; }
  }
  function load(key, fallback) {
    return safeParse(localStorage.getItem(key) || "", fallback);
  }
  function save(key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj)); } catch (e) {}
  }
  function remove(key) {
    try { localStorage.removeItem(key); } catch (e) {}
  }

  function isBoS() {
    return document.body && document.body.hasAttribute("data-bos");
  }
  function bosMode() {
    return document.body.getAttribute("data-bos"); // start | frag | puzzle
  }

  // ---------- keys (BoS-only; will not touch your other stories) ----------
  const BOS_VISITED = "bos_visited_keys_v1";     // {keys:{01:true,...}}
  const BOS_FRAGS   = "bos_fragments_v1";        // { "01":"text...", ... }
  const BOS_TRIES   = "bos_puzzle_attempts_v1";  // { n: 0.. }

  // ---------- BoS constants ----------
  // Correct story order (step1..12) expressed as CODES you must input:
  const BOS_CORRECT_CODES = ["05","10","02","07","11","04","12","08","06","01","09","03"];

  function normalizeCode(v) {
    v = (v || "").trim();
    if (!v) return "";
    if (v.length === 1) v = "0" + v;
    return v;
  }

  // ---------- visited ----------
  function bosLoadVisited() {
    const obj = load(BOS_VISITED, { keys: {} });
    if (!obj.keys) obj.keys = {};
    return obj;
  }
  function bosSaveVisited(obj) {
    save(BOS_VISITED, obj);
  }
  function bosMarkVisited(code) {
    const obj = bosLoadVisited();
    obj.keys[code] = true;
    bosSaveVisited(obj);
  }
  function bosApplyVisitedOnStart() {
    const obj = bosLoadVisited();
    const keys = obj.keys || {};
    document.querySelectorAll("[data-bos-key]").forEach(function (a) {
      const code = a.getAttribute("data-code");
      if (code && keys[code]) a.classList.add("visited-choice");
    });
  }

  // ---------- shuffle + float layout ----------
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function bosInitCloud() {
    const cloud = document.querySelector("[data-bos-cloud]");
    if (!cloud) return;

    // Shuffle DOM order
    const items = Array.from(cloud.querySelectorAll("[data-bos-key]"));
    shuffle(items).forEach(function (el) { cloud.appendChild(el); });

    // Random absolute positions (within cloud box)
    const w = cloud.clientWidth || 920;
    const h = cloud.clientHeight || 520;

    items.forEach(function (el) {
      const x = Math.floor(Math.random() * Math.max(20, w - 280));
      const y = Math.floor(Math.random() * Math.max(40, h - 60));
      el.style.left = x + "px";
      el.style.top = y + "px";
      el.style.setProperty("--floatDelay", (Math.random() * 1.8).toFixed(2) + "s");
      el.style.setProperty("--floatAmp", (10 + Math.random() * 12).toFixed(0) + "px");
    });
  }

  // ---------- vanish then navigate (for BoS start keys only) ----------
  function vanishAndGo(clicked, delayMs) {
    const href = clicked.getAttribute("href");
    if (!href) return;

    const all = Array.from(document.querySelectorAll("[data-bos-key]"));
    all.forEach(function (a) { a.style.pointerEvents = "none"; });

    all.forEach(function (a) {
      if (a !== clicked) a.classList.add("vanish");
    });

    clicked.classList.add("chosen");
    setTimeout(function () { location.href = href; }, delayMs || 1500);
  }

  // ---------- fragments saving ----------
  function bosLoadFrags() {
    return load(BOS_FRAGS, {});
  }
  function bosSaveFrags(obj) {
    save(BOS_FRAGS, obj);
  }

  function bosCaptureFragmentIfAny() {
    // On fragment pages, save pasted story text (innerText) into localStorage by code.
    if (bosMode() !== "frag") return;

    const code = document.body.getAttribute("data-code"); // "01".."12"
    if (!code) return;

    const p = document.querySelector(".story p");
    if (!p) return;

    // Save only if user has pasted real text (not the placeholder)
    const text = (p.innerText || "").trim();
    if (!text) return;

    // Heuristic: if still contains placeholder marker, ignore
    if (text.indexOf("PASTE HERE") !== -1 || text.indexOf("【PASTE") !== -1) return;

    const frags = bosLoadFrags();
    frags[code] = text;
    bosSaveFrags(frags);
  }

  // ---------- puzzle ----------
  function bosGetTries() {
    const obj = load(BOS_TRIES, { n: 0 });
    return obj.n || 0;
  }
  function bosSetTries(n) {
    save(BOS_TRIES, { n: n });
  }

  function bosPuzzleInit() {
    if (bosMode() !== "puzzle") return;

    const form = document.querySelector("[data-bos-form]");
    const inputs = Array.from(document.querySelectorAll(".bos-input"));
    const feedback = document.querySelector("[data-bos-feedback]");
    const rebuildWrap = document.querySelector("[data-bos-rebuild]");
    const fulltext = document.querySelector("[data-bos-fulltext]");

    function setHTML(el, html) {
      if (!el) return;
      el.innerHTML = html;
    }

    function escapeHTML(s) {
      return (s || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    }

    function reconstructFull() {
      const frags = bosLoadFrags();
      // Build in correct story order (step1..12 => BOS_CORRECT_CODES)
      const parts = BOS_CORRECT_CODES.map(function (code) {
        return frags[code] ? frags[code] : ("[MISSING " + code + " — open that fragment page first]");
      });
      return parts.join("\n\n");
    }

    function showFull() {
      if (!rebuildWrap || !fulltext) return;
      const txt = reconstructFull();
      fulltext.innerHTML = escapeHTML(txt).replace(/\n/g, "<br>");
      rebuildWrap.style.display = "block";
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();

      const guess = inputs.map(function (inp) { return normalizeCode(inp.value); });
      const answer = BOS_CORRECT_CODES;

      let correctPos = 0;
      const marks = [];

      for (let i = 0; i < answer.length; i++) {
        const ok = guess[i] === answer[i];
        if (ok) correctPos++;
        marks.push(ok);
      }

      const acc = correctPos / answer.length;

      if (acc >= 0.60) {
        setHTML(feedback, `<div class="bos-msg ok">Accuracy: ${(acc*100).toFixed(0)}% — unlocked.</div>`);
        showFull();
        return;
      }

      // failed
      let n = bosGetTries() + 1;
      bosSetTries(n);

      if (n < 3) {
        setHTML(feedback, `<div class="bos-msg bad">Accuracy: ${(acc*100).toFixed(0)}% — try again. (Attempt ${n}/3)</div>`);
        return;
      }

      // hints after 3 fails
      const hintLine = marks.map(function (ok, i) {
        return `<span class="bos-hint ${ok ? "yes" : "no"}">${String(i+1).padStart(2,"0")}${ok ? "✓" : "·"}</span>`;
      }).join("");

      setHTML(feedback,
        `<div class="bos-msg bad">Accuracy: ${(acc*100).toFixed(0)}% — hints enabled.</div>
         <div class="bos-hints">${hintLine}</div>
         <div class="bos-msg muted">Unlock requires ≥ 60%.</div>`
      );
    });
  }

  // ---------- start page reset ----------
  function bosWireResetOnStart() {
    if (bosMode() !== "start") return;
    const btn = document.querySelector(".reset-marks");
    if (!btn) return;

    btn.addEventListener("click", function (e) {
      e.preventDefault();
      remove(BOS_VISITED);
      remove(BOS_FRAGS);
      remove(BOS_TRIES);
      location.reload();
    });
  }

  // ---------- click handler (BoS start keys) ----------
  function bosWireKeyClicks() {
    if (bosMode() !== "start") return;

    document.addEventListener("click", function (e) {
      const a = e.target.closest("[data-bos-key]");
      if (!a) return;

      const code = a.getAttribute("data-code");
      if (code) bosMarkVisited(code);

      e.preventDefault();
      vanishAndGo(a, 800); // longer delay so user can SEE vanish
    }, true);
  }

  // ---------- init ----------
  window.addEventListener("DOMContentLoaded", function () {
    if (!isBoS()) return;

    if (bosMode() === "start") {
      bosInitCloud();
      bosApplyVisitedOnStart();
      bosWireResetOnStart();
      bosWireKeyClicks();
      return;
    }

    if (bosMode() === "frag") {
      bosCaptureFragmentIfAny();
      return;
    }

    if (bosMode() === "puzzle") {
      bosPuzzleInit();
      return;
    }
  });
})();

// ===============================
// FG ONLY: vanish + delay jump
// ===============================
(function () {
  function isFG() {
    return document.body && /\bfg\d+\b/.test(document.body.className);
  }

  if (!isFG()) return;

  document.addEventListener(
    "click",
    function (e) {
      const a = e.target.closest("a.choice");
      if (!a) return;

      const href = a.getAttribute("href");
      if (!href) return;

      e.preventDefault();

      const all = Array.from(document.querySelectorAll("a.choice"));

      // lock immediately
      all.forEach(function (el) {
        el.style.pointerEvents = "none";
      });

      // vanish others
      all.forEach(function (el) {
        if (el !== a) el.classList.add("vanish");
      });

      // emphasize chosen
      a.style.opacity = "1";
      a.style.transform = "scale(1.03)";

      // ⏳ 延迟跳转（你要的“明显停顿”）
      setTimeout(function () {
        location.href = href;
      }, 1000); // ← 这里随便调：1200 / 1500 / 1800
    },
    true
  );
})();
