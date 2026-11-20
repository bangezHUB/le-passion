// Sifreli yayin modu. Site herkese acik bir yerde (ör. GitHub Pages) durunca kitap dosyalari
// parola ile sifrelenir: library/**/*.json -> *.json.enc  (gzip + AES-256-GCM, anahtar PBKDF2-SHA256).
// config.json yoksa (yerel calisma) hicbir sey degismez.

const te = new TextEncoder();
const td = new TextDecoder();
const REMEMBER_KEY = "lp:key";
const CHECK_TEXT = "le-passion";

let config = null; // null: sifresiz | {encrypted, salt, iterations, check}
let key = null;

const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function gunzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}

async function decryptBytes(k, buf) {
  const data = new Uint8Array(buf);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: data.slice(0, 12) }, k, data.slice(12));
  return plain;
}

async function verify(k) {
  try { return td.decode(await decryptBytes(k, fromB64(config.check))) === CHECK_TEXT; } catch { return false; }
}

export async function initCrypto() {
  try {
    const res = await fetch("config.json", { cache: "no-cache" });
    if (res.ok && (res.headers.get("content-type") ?? "").includes("json")) config = await res.json();
  } catch { /* yerel mod */ }
  if (!config?.encrypted) { config = null; return; }
  try {
    const saved = JSON.parse(localStorage.getItem(REMEMBER_KEY));
    if (saved) {
      const k = await crypto.subtle.importKey("jwk", saved, "AES-GCM", true, ["decrypt"]);
      if (await verify(k)) key = k;
      else localStorage.removeItem(REMEMBER_KEY); // parola degismis
    }
  } catch { /* kayit yok */ }
}

export const isEncrypted = () => !!config;
export const isUnlocked = () => !config || !!key;
export const dataUrl = (path) => (config ? `${path}.enc` : path);

export async function unlock(passphrase, remember) {
  const base = await crypto.subtle.importKey("raw", te.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  const k = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: fromB64(config.salt), iterations: config.iterations, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, true, ["decrypt"],
  );
  if (!(await verify(k))) return false;
  key = k;
  if (remember) {
    try { localStorage.setItem(REMEMBER_KEY, JSON.stringify(await crypto.subtle.exportKey("jwk", k))); } catch { /* gizli mod */ }
  }
  return true;
}

export function lock() {
  key = null;
  try { localStorage.removeItem(REMEMBER_KEY); } catch { /* yok */ }
}

/** Sifreli bir dosyayi indirir, cozer ve JSON dondurur. */
export async function fetchEncryptedJSON(path) {
  const res = await fetch(dataUrl(path), { cache: "no-cache" });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  const plain = await decryptBytes(key, await res.arrayBuffer());
  return JSON.parse(td.decode(await gunzip(new Uint8Array(plain))));
}
