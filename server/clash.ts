// Ludo Clash 225 — moteur de jeu en ligne (serveur faisant autorité)
// Le dé est tiré ici, chaque coup est vérifié ici. Les téléphones ne font qu'afficher.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
class Oops extends Error { constructor(public msg: string, public status = 400) { super(msg); } }

// ---------- Hasard cryptographique sans biais ----------
function rndInt(n: number): number {
  const a = new Uint32Array(1), M = 4294967296, lim = M - (M % n);
  do { crypto.getRandomValues(a); } while (a[0] >= lim);
  return a[0] % n;
}
const chance = (p: number) => rndInt(1000) < p * 1000;

// ---------- Règles ----------
const START = [0, 13, 26, 39];
const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
const STARTSET = new Set(START);
const P_SIX = 0.23, P_ANTISTACK = 0.85;

type Ev = Record<string, unknown>;
type Seat = { name: string | null; bot: boolean };
type State = {
  seats: Seat[]; people: { name: string; team: number | null; host: boolean }[]; level: string;
  active: boolean[]; isBot: boolean[]; pos: number[][]; cur: number; phase: string; dice: number;
  movable: number[]; ranks: number[]; sixes: number; firstOut: boolean; evs: Ev[];
};

const tIdx = (t: number, p: number) => (START[t] + p) % 52;
const canMove = (s: State, t: number, i: number, d: number) => {
  const p = s.pos[t][i];
  if (p === 56) return false;
  if (p < 0) return d === 6;
  return p + d <= 56;
};
function landsStack(s: State, t: number, i: number, d: number) {
  const p = s.pos[t][i];
  if (p < 0 || p + d > 56) return false;
  const np = p + d;
  if (np === 56) return false;
  if (np <= 50) {
    const idx = tIdx(t, np);
    if (STARTSET.has(idx)) return false;
    const safe = SAFE.has(idx);
    return s.pos.some((arr, o) => arr.some((q, j) => !(o === t && j === i) && q >= 0 && q <= 50 && tIdx(o, q) === idx && (o === t || safe)));
  }
  return s.pos[t].some((q, j) => j !== i && q === np);
}
function valueStacks(s: State, t: number, d: number) {
  const legal = [0, 1, 2, 3].filter((i) => canMove(s, t, i, d));
  return legal.length > 0 && legal.some((i) => landsStack(s, t, i, d));
}
function rollFor(s: State, t: number) {
  let d = s.sixes >= 2 ? rndInt(5) + 1 : chance(P_SIX) ? 6 : rndInt(5) + 1;
  if (d !== 6 && valueStacks(s, t, d) && chance(P_ANTISTACK)) {
    const alts = [1, 2, 3, 4, 5].filter((v) => v !== d && !valueStacks(s, t, v));
    if (alts.length) d = alts[rndInt(alts.length)];
  }
  return d;
}
const finished = (s: State, t: number) => s.pos[t].every((q) => q === 56);

function nextTurn(s: State, evs: Ev[]) {
  s.sixes = 0;
  let n = 0;
  do { s.cur = (s.cur + 1) % 4; n++; } while ((s.ranks.includes(s.cur) || !s.active[s.cur]) && n < 4);
  s.phase = "roll"; s.movable = [];
  evs.push({ k: "turn", t: s.cur });
}

function applyMove(s: State, t: number, i: number, d: number, evs: Ev[]) {
  const from = s.pos[t][i];
  const exited = from < 0;
  const p = exited ? 0 : from + d;
  s.pos[t][i] = p;
  const star = p <= 50 && SAFE.has(tIdx(t, p));
  const caps: number[][] = [];
  let blk = -1;
  if (p <= 50 && !star) {
    const idx = tIdx(t, p);
    const at = (o: number) => s.pos[o].map((q, j) => (q >= 0 && q <= 50 && tIdx(o, q) === idx ? j : -1)).filter((j) => j >= 0);
    for (let o = 0; o < 4; o++) if (o !== t && at(o).length >= 2) blk = o;
    if (blk >= 0) s.pos[t][i] = -1;
    else for (let o = 0; o < 4; o++) { if (o === t) continue; for (const j of at(o)) { s.pos[o][j] = -1; caps.push([o, j]); } }
  }
  const home = p === 56;
  const ev: Ev = { k: "move", t, i, from, to: p, d, caps, blk, star, home, exited, first: exited && !s.firstOut };
  if (exited) s.firstOut = true;
  s.movable = [];
  if (finished(s, t) && !s.ranks.includes(t)) {
    s.ranks.push(t);
    ev.rank = s.ranks.length - 1;
    evs.push(ev);
    const left = [0, 1, 2, 3].filter((o) => s.active[o] && !s.ranks.includes(o));
    if (left.length <= 1) { s.ranks.push(...left); s.phase = "over"; evs.push({ k: "over", ranks: s.ranks }); return; }
    nextTurn(s, evs);
    return;
  }
  evs.push(ev);
  if (d === 6 || caps.length || (home && blk < 0)) { s.phase = "roll"; evs.push({ k: "again", t }); }
  else nextTurn(s, evs);
}

function doRoll(s: State, evs: Ev[]) {
  const t = s.cur;
  const d = rollFor(s, t);
  s.dice = d;
  s.sixes = d === 6 ? s.sixes + 1 : 0;
  evs.push({ k: "roll", t, d });
  const mov = [0, 1, 2, 3].filter((i) => canMove(s, t, i, d));
  if (!mov.length) { evs.push({ k: "pass", t, d }); nextTurn(s, evs); return; }
  const same = mov.every((i) => s.pos[t][i] === s.pos[t][mov[0]]);
  if (mov.length === 1 || same) { applyMove(s, t, mov[0], d, evs); return; }
  s.movable = mov; s.phase = "move";
}

// ---------- Bots : Gaou, Yêrê, Danhéré ----------
function danger(s: State, t: number, np: number) {
  if (np > 50) return 0;
  const idx = tIdx(t, np);
  if (SAFE.has(idx)) return 0;
  let n = 0;
  for (let o = 0; o < 4; o++) {
    if (o === t || !s.active[o] || s.ranks.includes(o)) continue;
    for (const q of s.pos[o]) {
      if (q < 0 || q > 50) continue;
      const dist = (idx - tIdx(o, q) + 52) % 52;
      if (dist >= 1 && dist <= 6 && q + dist <= 50) n++;
    }
    if (s.pos[o].some((q) => q < 0)) { const dist = (idx - START[o] + 52) % 52; if (dist >= 1 && dist <= 5) n += 0.3; }
  }
  return n;
}
function evalMove(s: State, t: number, i: number, d: number) {
  const p = s.pos[t][i], np = p < 0 ? 0 : p + d;
  let sc = np / 6;
  if (p < 0) sc += 35;
  if (np === 56) sc += 48;
  else if (np > 50) sc += p <= 50 ? 18 : 4;
  else {
    const idx = tIdx(t, np), safe = SAFE.has(idx);
    if (safe) sc += 16;
    else {
      let blk = false, cap = 0;
      for (let o = 0; o < 4; o++) {
        if (o === t) continue;
        const js = s.pos[o].filter((q) => q >= 0 && q <= 50 && tIdx(o, q) === idx);
        if (js.length >= 2) blk = true; else if (js.length === 1) cap += 1 + js[0] / 50;
      }
      if (blk) return -100;
      sc += cap * 60;
      if (s.pos[t].some((q, j) => j !== i && q === np)) sc += 10;
      sc -= danger(s, t, np) * 22;
    }
  }
  if (p >= 0 && p <= 50) sc += danger(s, t, p) * 16;
  return sc;
}
function chooseMove(s: State, t: number, d: number) {
  const opts = [...s.movable];
  if (opts.length === 1) return opts[0];
  if (s.level === "gaou") return opts[rndInt(opts.length)];
  if (s.level === "yere" && chance(0.25)) return opts[rndInt(opts.length)];
  let best = opts[0], bs = -1e9;
  for (const i of opts) {
    let v = evalMove(s, t, i, d);
    if (s.level === "yere") v += rndInt(12);
    if (v > bs) { bs = v; best = i; }
  }
  return best;
}

// ---------- Salons ----------
const ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const newCode = () => Array.from({ length: 5 }, () => ALPHA[rndInt(ALPHA.length)]).join("");
function newToken() {
  const b = new Uint8Array(24); crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function sha256(t: string) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return Array.from(new Uint8Array(h)).map((x) => x.toString(16).padStart(2, "0")).join("");
}
const cleanName = (n: unknown) => String(n ?? "").replace(/[<>&"']/g, "").trim().slice(0, 16) || "Joueur";
const LEVELS = new Set(["gaou", "yere", "danhere"]);

function emptyState(): State {
  return {
    seats: [0, 1, 2, 3].map(() => ({ name: null, bot: false })), people: [], level: "yere",
    active: [false, false, false, false], isBot: [false, false, false, false],
    pos: [0, 1, 2, 3].map(() => [-1, -1, -1, -1]), cur: 0, phase: "lobby", dice: 0, movable: [],
    ranks: [], sixes: 0, firstOut: false, evs: [],
  };
}

async function loadRoom(code: string) {
  const { data, error } = await db.from("rooms").select("*").eq("code", code).maybeSingle();
  if (error) throw new Oops("Erreur serveur, réessaie.", 500);
  if (!data) throw new Oops("Ce salon n'existe pas. Vérifie le code.", 404);
  return data as { code: string; status: string; state: State; seq: number; updated_at: string };
}
async function me(code: string, token: unknown) {
  if (typeof token !== "string" || token.length < 20) throw new Oops("Accès refusé.", 403);
  const { data } = await db.from("players").select("*").eq("room", code).eq("token_hash", await sha256(token)).maybeSingle();
  if (!data) throw new Oops("Accès refusé.", 403);
  return data as { id: string; name: string; team: number | null; is_host: boolean };
}
async function save(room: { code: string; seq: number }, s: State, status?: string) {
  const patch: Record<string, unknown> = { state: s, seq: room.seq + 1, updated_at: new Date().toISOString() };
  if (status) patch.status = status;
  const { data, error } = await db.from("rooms").update(patch).eq("code", room.code).eq("seq", room.seq).select("seq");
  if (error) throw new Oops("Erreur serveur, réessaie.", 500);
  if (!data || !data.length) throw new Oops("conflict", 409);
}
async function refreshPeople(code: string, s: State) {
  const { data } = await db.from("players").select("name,team,is_host").eq("room", code).order("created_at");
  s.people = (data ?? []).map((p: { name: string; team: number | null; is_host: boolean }) => ({ name: p.name, team: p.team, host: p.is_host }));
  for (let t = 0; t < 4; t++) {
    const h = s.people.find((p) => p.team === t);
    s.seats[t] = { name: h ? h.name : null, bot: h ? false : s.seats[t].bot };
  }
}

async function handle(body: Record<string, unknown>) {
  const action = body.action as string;
  const code = String(body.code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

  if (action === "create") {
    for (let k = 0; k < 6; k++) {
      const c = newCode();
      const s = emptyState();
      const { error } = await db.from("rooms").insert({ code: c, state: s });
      if (error) continue;
      const token = newToken();
      await db.from("players").insert({ room: c, token_hash: await sha256(token), name: cleanName(body.name), is_host: true });
      const room = await loadRoom(c);
      await refreshPeople(c, room.state);
      await save(room, room.state);
      return { code: c, token };
    }
    throw new Oops("Impossible de créer le salon, réessaie.", 500);
  }

  if (action === "join") {
    const room = await loadRoom(code);
    if (room.status !== "lobby") throw new Oops("Le clash a déjà commencé dans ce salon.");
    const { count } = await db.from("players").select("id", { count: "exact", head: true }).eq("room", code);
    if ((count ?? 0) >= 4) throw new Oops("Le salon est plein (4 joueurs).");
    const token = newToken();
    await db.from("players").insert({ room: code, token_hash: await sha256(token), name: cleanName(body.name), is_host: false });
    await refreshPeople(code, room.state);
    await save(room, room.state);
    return { code, token };
  }

  const room = await loadRoom(code);
  const s = room.state;
  s.evs = [];

  if (action === "bot") {
    if (Number(body.seq) !== room.seq) return { ok: true, skipped: true };
    if (room.status !== "playing") return { ok: true, skipped: true };
    // Joueur absent depuis plus de 20 s (chrono du tour) : le serveur joue un coup à sa place pour ne pas bloquer le clash
    const afk = !s.isBot[s.cur] && !!body.afk && Date.now() - Date.parse(room.updated_at) > 19500;
    if (!s.isBot[s.cur] && !afk) return { ok: true, skipped: true };
    const lvl = s.level;
    if (afk) { s.level = "yere"; s.evs.push({ k: "afk", t: s.cur }); }
    if (s.phase === "roll") doRoll(s, s.evs);
    else if (s.phase === "move") applyMove(s, s.cur, chooseMove(s, s.cur, s.dice), s.dice, s.evs);
    else return { ok: true, skipped: true };
    s.level = lvl;
    await save(room, s, s.phase === "over" ? "over" : undefined);
    return { ok: true };
  }

  const p = await me(code, body.token);

  switch (action) {
    case "pick": {
      if (room.status !== "lobby") throw new Oops("Le clash a déjà commencé.");
      const t = Number(body.team);
      if (!(t >= 0 && t <= 3)) throw new Oops("Artiste invalide.");
      if (s.seats[t].name && p.team !== t) throw new Oops("Cet artiste est déjà pris.");
      await db.from("players").update({ team: t }).eq("id", p.id);
      s.seats[t].bot = false;
      await refreshPeople(code, s);
      break;
    }
    case "setbot": {
      if (room.status !== "lobby") throw new Oops("Le clash a déjà commencé.");
      if (!p.is_host) throw new Oops("Seul l'hôte peut ajouter des bots.", 403);
      const t = Number(body.team);
      if (!(t >= 0 && t <= 3) || s.seats[t].name) throw new Oops("Cette place n'est pas libre.");
      s.seats[t].bot = !!body.bot;
      break;
    }
    case "level": {
      if (!p.is_host) throw new Oops("Seul l'hôte choisit le niveau.", 403);
      if (!LEVELS.has(String(body.level))) throw new Oops("Niveau invalide.");
      s.level = String(body.level);
      break;
    }
    case "start": {
      if (room.status !== "lobby") throw new Oops("Le clash a déjà commencé.");
      if (!p.is_host) throw new Oops("Seul l'hôte peut lancer le clash.", 403);
      await refreshPeople(code, s);
      const act = s.seats.map((x) => !!x.name || x.bot);
      if (act.filter(Boolean).length < 2) throw new Oops("Faut au moins 2 artistes pour faire clash !");
      if (s.people.some((x) => x.team === null)) throw new Oops("Tout le monde doit choisir son artiste avant de lancer.");
      s.active = act; s.isBot = s.seats.map((x) => !x.name && x.bot);
      s.pos = [0, 1, 2, 3].map(() => [-1, -1, -1, -1]);
      s.ranks = []; s.sixes = 0; s.firstOut = false; s.dice = 0; s.movable = [];
      s.cur = act.indexOf(true); s.phase = "roll";
      s.evs.push({ k: "start" }, { k: "turn", t: s.cur });
      await save(room, s, "playing");
      return { ok: true };
    }
    case "roll": {
      if (room.status !== "playing" || s.phase !== "roll") throw new Oops("Ce n'est pas le moment de lancer.");
      if (p.team !== s.cur) throw new Oops("Ce n'est pas ton tour.");
      doRoll(s, s.evs);
      break;
    }
    case "move": {
      if (room.status !== "playing" || s.phase !== "move") throw new Oops("Lance d'abord le dé.");
      if (p.team !== s.cur) throw new Oops("Ce n'est pas ton tour.");
      const i = Number(body.pawn);
      if (!s.movable.includes(i)) throw new Oops("Ce pion ne peut pas bouger.");
      applyMove(s, s.cur, i, s.dice, s.evs);
      break;
    }
    case "rematch": {
      if (!p.is_host) throw new Oops("Seul l'hôte peut relancer.", 403);
      s.phase = "lobby"; s.evs = [{ k: "lobby" }];
      await refreshPeople(code, s);
      await save(room, s, "lobby");
      return { ok: true };
    }
    case "leave": {
      if (room.status === "lobby") {
        await db.from("players").delete().eq("id", p.id);
        await refreshPeople(code, s);
        if (p.is_host) {
          const { data } = await db.from("players").select("id").eq("room", code).order("created_at").limit(1);
          if (data && data.length) { await db.from("players").update({ is_host: true }).eq("id", data[0].id); await refreshPeople(code, s); }
          else { await db.from("rooms").delete().eq("code", code); return { ok: true }; }
        }
      }
      break;
    }
    case "me": return { team: p.team, host: p.is_host, name: p.name };
    default: throw new Oops("Action inconnue.");
  }
  await save(room, s, s.phase === "over" ? "over" : undefined);
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Requête invalide." }, 400); }
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return json(await handle(body)); }
    catch (e) {
      if (e instanceof Oops) {
        if (e.status === 409 && attempt < 2 && body.action !== "bot") continue;
        if (e.status === 409) return json({ error: "Le salon a bougé, réessaie.", conflict: true }, 409);
        return json({ error: e.msg }, e.status);
      }
      console.error(e);
      return json({ error: "Erreur serveur, réessaie." }, 500);
    }
  }
  return json({ error: "Erreur serveur." }, 500);
});
