// Le Passion - ana uygulama: yonlendirme, kutuphane, kitap, kayitlilar.
import { h, getJSON, pad, download } from "./util.js";
import * as S from "./state.js";
import { buildChapterView, applyReaderClasses } from "./reader.js";
import { initCrypto, isEncrypted, isUnlocked, unlock, lock, dataUrl } from "./crypto.js";

const app = document.getElementById("app");
const LEVEL = { original: "Original", A1: "A1", A2: "A2", B1: "B1" };

let cleanup = null; // gecerli gorunumun temizleyicisi

/* ---------- Ust cubuk ---------- */
function flip(key, after) {
  return (e) => {
    S.settings[key] = !S.settings[key];
    S.saveSettings();
    e.currentTarget.setAttribute("aria-pressed", String(S.settings[key]));
    applyReaderClasses();
    after?.();
  };
}

function zoom(delta) {
  S.settings.scale = Math.min(1.8, Math.max(0.8, Math.round((S.settings.scale + delta) * 10) / 10));
  S.saveSettings();
}

const THEME_LABEL = { auto: "Theme: automatic", light: "Theme: light", dark: "Theme: dark" };

function bar({ back, title, tools = false }) {
  const items = [];
  if (back) items.push(h("a", { class: "btn ghost", href: back.href }, back.label));
  items.push(h("div", { class: "title" }, title ?? ""));
  if (tools) {
    const themeBtn = h("button", {
      class: "menu-item", type: "button",
      onclick: (e) => {
        const order = ["auto", "light", "dark"];
        S.settings.theme = order[(order.indexOf(S.settings.theme) + 1) % order.length];
        S.saveSettings();
        e.currentTarget.textContent = THEME_LABEL[S.settings.theme];
      },
    }, THEME_LABEL[S.settings.theme]);

    items.push(
      h("button", { class: "btn", type: "button", "aria-label": "Smaller text", onclick: () => zoom(-0.1) }, "A−"),
      h("button", { class: "btn", type: "button", "aria-label": "Larger text", onclick: () => zoom(0.1) }, "A+"),
      h("button", {
        class: "btn", type: "button", "aria-pressed": String(S.settings.hideEn),
        title: "Blur the English until you point at a phrase", onclick: flip("hideEn"),
      }, "Hide English"),
      h("details", { class: "menu" },
        h("summary", { class: "btn" }, "Display"),
        h("div", { class: "menu-panel" },
          h("button", { class: "menu-item", type: "button", "aria-pressed": String(S.settings.colors), onclick: flip("colors") }, "Phrase colours"),
          h("button", { class: "menu-item", type: "button", "aria-pressed": String(S.settings.swap), onclick: flip("swap") }, "Swap sides"),
          h("button", { class: "menu-item", type: "button", "aria-pressed": String(S.settings.view === "focus"),
            onclick: () => { S.settings.view = S.settings.view === "focus" ? "scroll" : "focus"; S.saveSettings(); route(true); },
          }, "One sentence at a time"),
          themeBtn,
          h("a", { class: "menu-item", href: "#/saved" }, `Saved phrases (${S.savedItems().length})`))),
    );
  }
  return h("header", { class: "bar" }, h("div", { class: "bar-inner" }, items));
}

document.addEventListener("click", (e) => {
  document.querySelectorAll("details.menu[open]").forEach((d) => { if (!d.contains(e.target)) d.open = false; });
});

/* ---------- Kutuphane ---------- */
async function showLibrary() {
  document.title = "Le Passion";
  let books = [];
  let failed = false;
  try { books = await getJSON("library/index.json"); } catch { failed = true; }

  const list = books.length
    ? h("ul", { class: "shelf" }, books.map((b) => {
        const prog = S.getProgress(b.slug);
        return h("li", {},
          h("a", { href: `#/book/${b.slug}` },
            h("span", { class: "spine" }),
            h("span", {},
              h("div", { class: "t" }, b.title),
              h("div", { class: "m" }, `${b.source_lang === "en" ? "English" : "French"} source · ${LEVEL[b.level] ?? b.level} French · ${b.chapters} ${b.chapters === 1 ? "chapter" : "chapters"}`)),
            h("span", { class: "go" }, prog ? "Continue" : "Open")));
      }))
    : h("div", { class: "empty" },
        failed ? "The library could not be loaded. Start the server with " : "No books yet. Add one with ",
        h("code", {}, failed ? "python serve.py" : "python -m pipeline.build book.epub"), ".");

  const nSaved = S.savedItems().length, nFlags = S.flagItems().length;
  const sync = S.sync.state === "ok" ? "Progress syncs between your devices." : "Progress is stored on this device only.";

  app.replaceChildren(
    bar({ title: "" }),
    h("main", { class: "page" },
      h("div", { class: "lib-head" },
        h("h1", {}, "Le Passion"),
        h("p", {}, "Read French next to English. Matching phrases share a colour.")),
      list,
      h("p", { class: "foot" },
        h("a", { href: "#/saved" }, `Saved phrases (${nSaved})`),
        nFlags ? ` · ${nFlags} flagged ${nFlags === 1 ? "translation" : "translations"}` : "",
        h("br"), sync,
        isEncrypted() ? h("br") : "",
        isEncrypted() ? h("a", { href: "#/", onclick: () => { lock(); location.reload(); } }, "Lock this device") : "")));
}

/* ---------- Kitap ---------- */
async function saveOffline(slug, book, btn) {
  const urls = ["library/index.json", `library/${slug}/book.json`, ...book.chapters.map((c) => `library/${slug}/chapters/${pad(c.id)}.json`)];
  btn.disabled = true;
  let done = 0;
  for (const url of urls) {
    try { await fetch(dataUrl(url), { cache: "reload" }); } catch { /* cevrimdisi */ }
    btn.textContent = `Saving ${++done} / ${urls.length}`;
  }
  btn.textContent = "Available offline ✓";
}

async function showBook(slug) {
  let book;
  try { book = await getJSON(`library/${slug}/book.json`); }
  catch { return notFound("This book is not in the library."); }
  document.title = `${book.title} – Le Passion`;
  const prog = S.getProgress(slug);

  const offlineBtn = h("button", { class: "btn", type: "button", onclick: (e) => saveOffline(slug, book, e.currentTarget) }, "Save for offline reading");
  app.replaceChildren(
    bar({ back: { href: "#/", label: "Library" }, title: book.title }),
    h("main", { class: "page" },
      h("div", { class: "book-head" },
        h("h1", {}, book.title),
        h("p", {}, `${LEVEL[book.level] ?? book.level} French`)),
      h("div", { class: "actions" },
        prog ? h("a", { class: "btn primary", href: `#/book/${slug}/${prog.chapter}/${prog.row}` }, `Continue – chapter ${prog.chapter}`) : "",
        offlineBtn),
      h("ol", { class: "chapters" }, book.chapters.map((c) =>
        h("li", {}, h("a", { href: `#/book/${slug}/${c.id}` },
          h("span", {}, c.title),
          h("span", { class: "n" }, `${c.sentences} sentences`)))))));
}

/* ---------- Kayitlilar ---------- */
function showSaved() {
  document.title = "Saved – Le Passion";
  const saved = S.savedItems();
  const flags = S.flagItems();
  const link = (it) => `#/book/${it.slug}/${it.chapter}/${it.row}`;

  const phraseList = saved.length
    ? h("ul", { class: "items" }, saved.map((it) => h("li", {},
        h("div", { class: "pair" },
          h("a", { class: "fr-p", lang: "fr", href: link(it) }, it.fr), h("span", { class: "en-p", lang: "en" }, it.en)),
        h("div", { class: "ctx", lang: "fr" }, it.frSentence),
        h("button", { class: "btn ghost", type: "button", onclick: () => { S.removeItem("saved", it.id); showSaved(); } }, "Remove"))))
    : h("div", { class: "empty" }, "Nothing saved yet. Tap a phrase while reading and choose Save phrase.");

  const flagList = flags.length
    ? h("ul", { class: "items" }, flags.map((it) => h("li", {},
        h("div", { class: "pair" }, h("a", { class: "fr-p", lang: "fr", href: link(it) }, it.fr)),
        h("div", { class: "ctx", lang: "en" }, it.en),
        h("button", { class: "btn ghost", type: "button", onclick: () => { S.removeItem("flags", it.id); showSaved(); } }, "Remove"))))
    : h("div", { class: "empty" }, "No flagged translations. Tap a phrase and choose Flag translation when a sentence reads wrong.");

  app.replaceChildren(
    bar({ back: { href: "#/", label: "Library" }, title: "Saved" }),
    h("main", { class: "page" },
      h("div", { class: "book-head" }, h("h1", {}, "Saved phrases")),
      h("div", { class: "actions" },
        h("button", { class: "btn primary", type: "button", disabled: !saved.length,
          onclick: () => download("le-passion-anki.txt", S.ankiExport()) }, "Export for Anki")),
      phraseList,
      h("div", { class: "book-head sub" }, h("h2", {}, "Flagged translations"),
        h("p", {}, "Export these and run python -m pipeline.refix on your computer to redo them.")),
      h("div", { class: "actions" },
        h("button", { class: "btn", type: "button", disabled: !flags.length,
          onclick: () => download("flags.json", S.flagsExport(), "application/json") }, "Export flags"),
        h("button", { class: "btn ghost", type: "button", disabled: !flags.length,
          onclick: () => { if (confirm("Clear all flags? Do this after the sentences have been redone.")) { S.clearFlags(); showSaved(); } } }, "Clear all")),
      flagList));
}

/* ---------- Bolum ---------- */
async function showChapter(slug, chapterId, rowParam) {
  let book, chapter;
  try {
    book = await getJSON(`library/${slug}/book.json`);
    chapter = await getJSON(`library/${slug}/chapters/${pad(chapterId)}.json`);
  } catch { return notFound("This chapter is not available."); }

  document.title = `${chapter.title} – ${book.title}`;
  const ids = book.chapters.map((c) => c.id);
  const pos = ids.indexOf(Number(chapterId));
  const prog = S.getProgress(slug);
  const startRow = rowParam != null ? Number(rowParam)
    : prog && prog.chapter === Number(chapterId) ? prog.row : 0;

  const view = buildChapterView({
    slug, chapterId: Number(chapterId), chapter,
    prevId: ids[pos - 1], nextId: ids[pos + 1], startRow,
  });
  cleanup = view.cleanup;
  app.replaceChildren(
    bar({ back: { href: `#/book/${slug}`, label: "Chapters" }, title: chapter.title, tools: true }),
    h("main", { class: "page" }, view.el));
  view.afterMount();
}

function notFound(message) {
  document.title = "Le Passion";
  app.replaceChildren(
    bar({ back: { href: "#/", label: "Library" }, title: "" }),
    h("main", { class: "page" }, h("div", { class: "lib-head" }, h("p", {}, message))));
}

/* ---------- Yonlendirme ---------- */
let current = "";
function route(force = false) {
  const hash = location.hash || "#/";
  if (hash === current && !force) return;
  current = hash;
  cleanup?.();
  cleanup = null;
  const m = hash.match(/^#\/book\/([^/]+)(?:\/(\d+)(?:\/(\d+))?)?$/);
  if (hash === "#/saved") showSaved();
  else if (m && m[2]) showChapter(m[1], m[2], m[3]);
  else if (m) showBook(m[1]);
  else showLibrary();
}
addEventListener("hashchange", () => { if (isUnlocked()) route(); });

/* ---------- Kilit ekrani (sifreli yayinda) ---------- */
function showUnlock() {
  document.title = "Le Passion";
  return new Promise((resolve) => {
    const input = h("input", { type: "password", id: "pass", autocomplete: "current-password", required: true, "aria-describedby": "unlock-msg" });
    const remember = h("input", { type: "checkbox", id: "remember", checked: true });
    const msg = h("p", { id: "unlock-msg", class: "unlock-msg", role: "alert" });
    const btn = h("button", { class: "btn primary", type: "submit" }, "Unlock");
    const form = h("form", { class: "unlock" },
      h("h1", {}, "Le Passion"),
      h("p", {}, "This library is encrypted. Enter your passphrase to read."),
      h("label", { for: "pass" }, "Passphrase"), input,
      h("label", { class: "check", for: "remember" }, remember, " Remember on this device"),
      msg, btn);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      btn.disabled = true;
      msg.textContent = "Checking…";
      const ok = await unlock(input.value, remember.checked);
      if (ok) { resolve(); return; }
      msg.textContent = "That passphrase did not work. Check it and try again.";
      btn.disabled = false;
      input.select();
    });
    app.replaceChildren(h("main", { class: "page" }, form));
    input.focus();
  });
}

async function boot() {
  await initCrypto();
  if (!isUnlocked()) await showUnlock();
  route(true);
  // Senkron varsa acilista bir kez cek; kutuphane ekranindaysak yenile
  S.syncNow().then(() => { if ((location.hash || "#/") === "#/") route(true); });
}
boot();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => { /* HTTPS/localhost disinda calismaz */ });
}
