// Ayarlar (cihaza ozel) ve kullanici verisi (ilerleme, kayitli ifadeler, isaretli cumleler).
// Kullanici verisi localStorage'da tutulur; sunucuda api/state varsa cihazlar arasi senkron edilir.

const read = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};
const write = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* gizli mod vb. */ }
};

/* ---------- Ayarlar ---------- */
export const settings = {
  scale: 1, swap: false, colors: true, theme: "auto", hideEn: false, view: "scroll",
  ...read("lp:settings", {}),
};

export function applySettings() {
  const root = document.documentElement;
  root.style.setProperty("--scale", settings.scale);
  if (settings.theme === "auto") root.removeAttribute("data-theme");
  else root.dataset.theme = settings.theme;
}
export function saveSettings() { write("lp:settings", settings); applySettings(); }
applySettings();

/* ---------- Kullanici verisi ---------- */
// progress: { slug: {chapter, row, t} }   saved/flags: { id: {..., t, del?} }  (del = silindi isareti)
let data = { progress: {}, saved: {}, flags: {}, ...read("lp:data", {}) };

// Eski surumden tasi (v1 yalnizca ilerleme tutuyordu)
for (const key of Object.keys(localStorage ?? {})) {
  if (key.startsWith("lp:progress:")) {
    const slug = key.slice("lp:progress:".length);
    data.progress[slug] ??= { ...read(key, {}), t: 0 };
  }
}

const listeners = new Set();
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

function commit(sync = true) {
  write("lp:data", data);
  listeners.forEach((fn) => fn());
  if (sync) scheduleSync();
}

export const getProgress = (slug) => data.progress[slug] ?? null;
export function setProgress(slug, chapter, row) {
  const cur = data.progress[slug];
  if (cur && cur.chapter === chapter && cur.row === row) return;
  data.progress[slug] = { chapter, row, t: Date.now() };
  commit();
}

const active = (obj) => Object.values(obj).filter((x) => !x.del).sort((a, b) => b.t - a.t);
export const savedItems = () => active(data.saved);
export const flagItems = () => active(data.flags);
export const isSaved = (id) => !!data.saved[id] && !data.saved[id].del;
export const isFlagged = (id) => !!data.flags[id] && !data.flags[id].del;

function toggleIn(bucket, item) {
  const cur = data[bucket][item.id];
  data[bucket][item.id] = cur && !cur.del ? { id: item.id, del: true, t: Date.now() } : { ...item, t: Date.now() };
  commit();
  return !data[bucket][item.id].del;
}
export const toggleSaved = (item) => toggleIn("saved", item);
export const toggleFlag = (item) => toggleIn("flags", item);
export function removeItem(bucket, id) {
  data[bucket][id] = { id, del: true, t: Date.now() };
  commit();
}
export function clearFlags() {
  for (const f of flagItems()) data.flags[f.id] = { id: f.id, del: true, t: Date.now() };
  commit();
}

/* ---------- Senkron ---------- */
export function merge(a, b) {
  const out = { progress: { ...a.progress }, saved: { ...a.saved }, flags: { ...a.flags } };
  for (const key of ["progress", "saved", "flags"]) {
    for (const [id, item] of Object.entries(b?.[key] ?? {})) {
      if (!out[key][id] || (item.t ?? 0) > (out[key][id].t ?? 0)) out[key][id] = item;
    }
  }
  return out;
}

export const sync = { state: "idle" }; // idle | ok | off
let timer = null;
function scheduleSync() {
  if (sync.state === "off") return;
  clearTimeout(timer);
  timer = setTimeout(syncNow, 4000);
}

export async function syncNow() {
  try {
    const res = await fetch("api/state", { cache: "no-store" });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("json")) throw new Error("no sync endpoint");
    data = merge(data, await res.json());
    write("lp:data", data);
    const put = await fetch("api/state", {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(data),
    });
    if (!put.ok) throw new Error("push failed");
    sync.state = "ok";
    listeners.forEach((fn) => fn());
  } catch {
    sync.state = "off"; // sunucu yok: sadece bu cihazda calis
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && sync.state !== "off") syncNow();
});

/* ---------- Disa aktarma ---------- */
const tsv = (s) => String(s ?? "").replace(/[\t\r\n]+/g, " ");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function ankiExport() {
  const lines = ["#separator:tab", "#html:true", "#tags column:3"];
  for (const it of savedItems().slice().reverse()) {
    const back = `${esc(it.en)}<br><br><i>${esc(it.frSentence)}</i><br>${esc(it.enSentence)}`;
    lines.push([tsv(it.fr), tsv(back), tsv(it.slug)].join("\t"));
  }
  return lines.join("\n") + "\n";
}

export function flagsExport() {
  return JSON.stringify(
    flagItems().map(({ slug, chapter, row, fr, en, t }) => ({ slug, chapter, row, fr, en, t })),
    null, 1,
  );
}
