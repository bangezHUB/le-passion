// Bolum okuyucusu: cift kolonlu satirlar, parca vurgusu, kaydet/isaretle menusu,
// Ingilizceyi gizleme ve tek cumle modu.
import { h } from "./util.js";
import * as S from "./state.js";

const strip = (s) => s.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
const groupText = (tokens, g) => strip(tokens.filter((t) => t.g === g).map((t) => t.w).join(" "));

/* ---------- Satir olusturma ---------- */
function renderTokens(tokens) {
  const frag = document.createDocumentFragment();
  let i = 0;
  while (i < tokens.length) {
    const g = tokens[i].g;
    const words = [];
    while (i < tokens.length && tokens[i].g === g) words.push(tokens[i++].w);
    frag.append(h("span", { class: "g", dataset: { g, c: (g % 5) + 1 } }, words.join(" ")));
    if (i < tokens.length) frag.append(" ");
  }
  return frag;
}

function renderRow(s, index) {
  const fr = h("div", { class: "fr", lang: "fr" });
  const en = h("div", { class: "en", lang: "en" });
  if (s.speaker) {
    fr.append(h("span", { class: "who" }, s.speaker));
    en.append(h("span", { class: "who" }, s.speaker));
  }
  fr.append(renderTokens(s.fr_t));
  en.append(renderTokens(s.en_t));
  if (s.warn?.length) {
    fr.append(h("span", { class: "flag", title: "This translation may be unreliable.", "aria-label": "Translation may be unreliable" }, "?"));
  }
  fr.append(h("span", { class: "flag mine", title: "You flagged this translation", "aria-label": "Flagged by you" }, "⚑"));
  en.append(h("button", {
    class: "peek", type: "button",
    onclick: (e) => { e.stopPropagation(); en.classList.toggle("reveal"); },
  }, "Show"));
  return h("div", { class: `row${s.h ? " h" : ""}`, dataset: { i: index } }, fr, en);
}

const flagId = (ctx, i) => `${ctx.slug}:${ctx.chapterId}:${i}`;
const phraseId = (ctx, i, g) => `${ctx.slug}:${ctx.chapterId}:${i}:${g}`;

function decorate(row, ctx) {
  const i = Number(row.dataset.i);
  row.classList.toggle("flagged", S.isFlagged(flagId(ctx, i)));
  row.querySelectorAll(".g").forEach((el) => el.classList.toggle("saved", S.isSaved(phraseId(ctx, i, Number(el.dataset.g)))));
}

/* ---------- Vurgu + sabitleme + menu ---------- */
let pinned = null; // { row, g }
let pop = null;

function closePop() { pop?.remove(); pop = null; }

function clearFocus(row) {
  if (!row) return;
  row.classList.remove("focus");
  row.querySelectorAll(".g.on, .g.pinned").forEach((el) => el.classList.remove("on", "pinned"));
}
function unpin() {
  if (pinned) clearFocus(pinned.row);
  pinned = null;
  closePop();
}
function focusGroup(el, pin = false) {
  const row = el.closest(".row");
  if (!row) return;
  if (pinned && pinned.row !== row) unpin();
  row.querySelectorAll(".g.on").forEach((x) => x.classList.remove("on"));
  row.classList.add("focus");
  row.querySelectorAll(`.g[data-g="${el.dataset.g}"]`).forEach((x) => x.classList.add("on"));
  if (pin) { el.classList.add("pinned"); pinned = { row, g: el.dataset.g }; }
}

function openPop(el, ctx, sentences) {
  closePop();
  const row = el.closest(".row");
  const i = Number(row.dataset.i);
  const g = Number(el.dataset.g);
  const s = sentences[i];
  const fr = groupText(s.fr_t, g);
  const en = groupText(s.en_t, g);
  const saved = S.isSaved(phraseId(ctx, i, g));
  const flagged = S.isFlagged(flagId(ctx, i));

  pop = h("div", { class: "pop", role: "dialog", "aria-label": "Phrase actions" },
    h("div", { class: "pop-text" }, h("span", { lang: "fr" }, fr || "—"), " → ", h("span", { lang: "en" }, en || "—")),
    h("div", { class: "pop-actions" },
      h("button", {
        class: "btn", type: "button", disabled: !fr || !en,
        onclick: () => {
          S.toggleSaved({ id: phraseId(ctx, i, g), slug: ctx.slug, chapter: ctx.chapterId, row: i, fr, en, frSentence: s.fr, enSentence: s.en });
          decorate(row, ctx);
          openPop(el, ctx, sentences);
        },
      }, saved ? "Saved ✓" : "Save phrase"),
      h("button", {
        class: "btn", type: "button",
        title: "Mark this translation as wrong so it can be redone",
        onclick: () => {
          S.toggleFlag({ id: flagId(ctx, i), slug: ctx.slug, chapter: ctx.chapterId, row: i, fr: s.fr, en: s.en });
          decorate(row, ctx);
          openPop(el, ctx, sentences);
        },
      }, flagged ? "Flagged ✓" : "Flag translation")));
  document.body.append(pop);

  const rect = el.getBoundingClientRect();
  const width = pop.offsetWidth;
  const left = Math.min(Math.max(8, rect.left + scrollX), document.documentElement.clientWidth - width - 8 + scrollX);
  pop.style.left = `${left}px`;
  pop.style.top = `${rect.bottom + scrollY + 6}px`;
}

function wire(reader, ctx, sentences) {
  unpin();
  reader.addEventListener("pointerover", (e) => {
    const g = e.target.closest(".g");
    if (!g || (pinned && pinned.row === g.closest(".row"))) return;
    focusGroup(g);
  });
  reader.addEventListener("pointerout", (e) => {
    const row = e.target.closest?.(".row");
    if (!row || (pinned && pinned.row === row)) return;
    if (!row.contains(e.relatedTarget)) clearFocus(row);
  });
  reader.addEventListener("click", (e) => {
    const g = e.target.closest(".g");
    if (!g) { unpin(); return; }
    const row = g.closest(".row");
    if (pinned && pinned.row === row && pinned.g === g.dataset.g) { unpin(); return; }
    unpin();
    focusGroup(g, true);
    openPop(g, ctx, sentences);
  });
}

/* ---------- Gorunum sinif ayarlari ---------- */
export function applyReaderClasses(el = document.querySelector(".reader")) {
  if (!el) return;
  el.classList.toggle("colors", S.settings.colors);
  el.classList.toggle("swap", S.settings.swap);
  el.classList.toggle("hide-en", S.settings.hideEn);
  el.classList.toggle("focus-mode", S.settings.view === "focus");
}

/* ---------- Bolum gorunumu ---------- */
export function buildChapterView({ slug, chapterId, chapter, prevId, nextId, startRow }) {
  const sentences = chapter.sentences;
  const ctx = { slug, chapterId };
  const reader = h("div", { class: "reader" });
  applyReaderClasses(reader);
  const rows = sentences.map((s, i) => renderRow(s, i));
  rows.forEach((r) => decorate(r, ctx));
  wire(reader, ctx, sentences);

  const cleanups = [S.onChange(() => rows.forEach((r) => decorate(r, ctx)))];
  let afterMount = () => {};

  const hasPrev = prevId != null, hasNext = nextId != null;
  const chapterUrl = (id, row) => `#/book/${slug}/${id}${row != null ? `/${row}` : ""}`;

  if (S.settings.view === "focus") {
    /* ----- tek cumle modu ----- */
    let idx = Math.min(Math.max(startRow ?? 0, 0), rows.length - 1);
    const stage = h("div", { class: "stage" });
    const count = h("span", { class: "count", "aria-live": "polite" });
    const prevBtn = h("button", { class: "btn", type: "button", onclick: () => go(-1) }, "Previous");
    const nextBtn = h("button", { class: "btn primary", type: "button", onclick: () => go(1) }, "Next");

    const show = (i) => {
      idx = Math.min(Math.max(i, 0), rows.length - 1);
      unpin();
      stage.replaceChildren(rows[idx]);
      count.textContent = `${idx + 1} / ${rows.length}`;
      prevBtn.textContent = idx === 0 && hasPrev ? "Previous chapter" : "Previous";
      prevBtn.disabled = idx === 0 && !hasPrev;
      nextBtn.textContent = idx === rows.length - 1 ? (hasNext ? "Next chapter" : "Finish") : "Next";
      S.setProgress(slug, chapterId, idx);
    };
    function go(delta) {
      const to = idx + delta;
      if (to < 0) { if (hasPrev) location.hash = chapterUrl(prevId, 99999); return; }
      if (to >= rows.length) { location.hash = hasNext ? chapterUrl(nextId) : `#/book/${slug}`; return; }
      show(to);
    }

    const onKey = (e) => {
      if (e.target.closest?.("input, textarea, select")) return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "PageDown" || e.key === " ") { e.preventDefault(); go(1); }
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "PageUp") { e.preventDefault(); go(-1); }
      else if (e.key === "e") rows[idx].querySelector(".en")?.classList.toggle("reveal");
      else if (e.key === "Escape") unpin();
    };
    document.addEventListener("keydown", onKey);
    cleanups.push(() => document.removeEventListener("keydown", onKey));

    let x0 = null, y0 = null;
    stage.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    stage.addEventListener("touchend", (e) => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 60 && Math.abs(dy) < 45) go(dx < 0 ? 1 : -1);
    }, { passive: true });

    reader.append(stage, h("nav", { class: "focus-nav" }, prevBtn, count, nextBtn));
    show(idx);
  } else {
    /* ----- kaydirmali mod ----- */
    reader.append(h("div", { class: "cols-head" }, h("span", {}, "Français"), h("span", {}, "English")));
    let para = null, paraIdx = null;
    rows.forEach((row, i) => {
      const p = sentences[i].p;
      if (p !== paraIdx) { para = h("section", { class: "para" }); reader.append(para); paraIdx = p; }
      para.append(row);
    });
    reader.append(h("nav", { class: "next" },
      hasPrev ? h("a", { class: "btn", href: chapterUrl(prevId) }, "Previous chapter") : h("span"),
      hasNext ? h("a", { class: "btn primary", href: chapterUrl(nextId) }, "Next chapter") : h("a", { class: "btn", href: `#/book/${slug}` }, "All chapters")));

    const onKey = (e) => { if (e.key === "Escape") unpin(); };
    document.addEventListener("keydown", onKey);
    cleanups.push(() => document.removeEventListener("keydown", onKey));

    afterMount = () => {
      if (startRow > 0) rows[Math.min(startRow, rows.length - 1)]?.scrollIntoView({ block: "start" });
      else window.scrollTo(0, 0);
      const observer = new IntersectionObserver((entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) S.setProgress(slug, chapterId, Number(top.target.dataset.i));
      }, { rootMargin: "-10% 0px -80% 0px" });
      rows.forEach((r) => observer.observe(r));
      cleanups.push(() => observer.disconnect());
    };
  }

  /* Ekran kapanmasin (destekleyen tarayicilarda) */
  let lock = null;
  const acquire = async () => { try { lock = await navigator.wakeLock?.request("screen"); } catch { /* izin yok */ } };
  const onVisible = () => { if (document.visibilityState === "visible") acquire(); };
  document.addEventListener("visibilitychange", onVisible);
  acquire();
  cleanups.push(() => { document.removeEventListener("visibilitychange", onVisible); lock?.release?.().catch(() => {}); });
  cleanups.push(() => { unpin(); });

  return {
    el: reader,
    afterMount,
    cleanup: () => cleanups.forEach((fn) => fn()),
  };
}
