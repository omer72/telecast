import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./Icon.jsx";
import { focusedClass, keyValue, useFocusGrid } from "./focus.js";
import { ChatCard, Keypad, MediaCard, Poster } from "./components.jsx";
import { useArt } from "./useArt.js";
import { fmtClock, formatRuntime } from "./data.js";
import { getGroups, getMe, getMedia, resolveMediaUrl, searchGlobalMedia } from "./api.js";
import { clearAllPositions, getPosition, loadFavorites, loadMovieFavorites, loadPositions, loadPrefs, savePosition, setPref, toggleFavorite, toggleMovieFavorite } from "./storage.js";
import { PACKAGES, exitApp, isInstalled } from "./intent.js";
import { checkForUpdate } from "./update.js";

// =========================================================
// PhoneEntry
// =========================================================
export function PhoneEntry({ onSubmit, busy = false, error = "" }) {
  const [phone, setPhone] = useState("");
  const [shake, setShake] = useState(false);

  const rows = useMemo(
    () => [
      ["k1", "k2", "k3"],
      ["k4", "k5", "k6"],
      ["k7", "k8", "k9"],
      ["kbk", "k0", "kok"],
    ],
    []
  );

  const handleEnter = (id) => {
    const v = keyValue(id);
    if (v === "BKSP") setPhone((p) => p.slice(0, -1));
    else if (v === "OK") {
      if (phone.length >= 10) onSubmit(phone);
      else {
        setShake(true);
        setTimeout(() => setShake(false), 400);
      }
    } else if (v !== null) {
      setPhone((p) => (p + v).slice(0, 13));
    }
  };

  const { focusedId } = useFocusGrid(rows, { onEnter: handleEnter, initial: "kok" });

  // Allow direct number-key input (real TV remotes have number buttons too,
  // and it's massively friendlier when driving the app from a desktop
  // keyboard). Handled in the capture phase so we run before useFocusGrid's
  // Backspace=onBack handler.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key >= "0" && e.key <= "9") {
        setPhone((p) => (p + e.key).slice(0, 13));
        e.preventDefault();
        e.stopPropagation();
      } else if (e.key === "Backspace") {
        setPhone((p) => p.slice(0, -1));
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const formatPhone = (raw) => {
    if (!raw) return "";
    const cc = raw.slice(0, 2);
    const rest = raw.slice(2);
    const p1 = rest.slice(0, 4);
    const p2 = rest.slice(4, 7);
    const p3 = rest.slice(7);
    return `+${cc}` + (p1 ? ` ${p1}` : "") + (p2 ? ` ${p2}` : "") + (p3 ? ` ${p3}` : "");
  };

  return (
    <div className="screen auth">
      <div className="auth-left">
        <div className="auth-eyebrow">
          <Icon name="chat" size={14} /> Sign in to Telegram
        </div>
        <h1 className="auth-title">
          Your big screen,
          <br />
          <em>your chats.</em>
        </h1>
        <p className="auth-sub">
          Telecast plays movies shared in your Telegram groups — files, direct streams, magnet links, even
          YouTube — on your TV.
        </p>
        <div className="auth-meta">
          <div className="auth-meta-row"><span className="dot"></span> End-to-end Telegram login flow</div>
          <div className="auth-meta-row"><span className="dot"></span> Your session stays on this TV only</div>
          <div className="auth-meta-row"><span className="dot"></span> Hand off to VLC, MX Player, or play in-app</div>
          {busy && (
            <div className="auth-meta-row" style={{ color: "var(--accent-2)" }}>
              <span className="dot" style={{ background: "var(--accent-2)" }}></span> Requesting login code…
            </div>
          )}
          {error && (
            <div className="auth-meta-row" style={{ color: "var(--bad)" }}>
              <span className="dot" style={{ background: "var(--bad)" }}></span> {error}
            </div>
          )}
        </div>
      </div>
      <div className="auth-right">
        <div className="phone-display" style={shake ? { animation: "shake .35s" } : null}>
          <div className="label">Phone number</div>
          <div className="value">
            {formatPhone(phone) || <span style={{ color: "var(--text-mute)" }}>+__ ____ ______</span>}
            <span className="cursor"></span>
          </div>
        </div>
        <Keypad focusedId={focusedId} onPress={handleEnter} />
        <div style={{ display: "flex", gap: 14, alignItems: "center", fontSize: 14, color: "var(--text-mute)" }}>
          <span><Icon name="info" size={14} /></span>
          <span>You'll get a code on your other Telegram device.</span>
        </div>
      </div>
    </div>
  );
}

// =========================================================
// PinEntry
// =========================================================
export function PinEntry({ phone, onSubmit, onBack, onResend, delivery, busy = false, remoteError = "" }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [resendStatus, setResendStatus] = useState(""); // "", "sending", "sent", "error: ..."
  // Telegram codes are usually 5 digits but can be 6+ for SMS fallback —
  // we accept anything 5+.
  const len = 5;

  const rows = useMemo(
    () => [
      ["k1", "k2", "k3"],
      ["k4", "k5", "k6"],
      ["k7", "k8", "k9"],
      ["kbk", "k0", "kok"],
      ["resend"],
    ],
    []
  );

  const handleResend = async () => {
    if (!onResend || resendStatus === "sending") return;
    setResendStatus("sending");
    const res = await onResend();
    // No result means the guard in App.jsx dropped it because another auth
    // call was already in flight — that's not an error, so say nothing.
    if (!res) { setResendStatus(""); return; }
    setResendStatus(res.ok ? "sent" : `error: ${res.error || "failed"}`);
    setTimeout(() => setResendStatus(""), 5000);
  };

  const handleEnter = (id) => {
    const v = keyValue(id);
    setError(false);
    if (id === "resend") { handleResend(); return; }
    if (v === "BKSP") setPin((p) => p.slice(0, -1));
    else if (v === "OK") {
      if (pin.length === len) onSubmit(pin);
      else setError(true);
    } else if (v !== null) {
      setPin((p) => (p.length < len ? p + v : p));
    }
  };

  const { focusedId } = useFocusGrid(rows, { onEnter: handleEnter, onBack, initial: "k1" });

  // Direct number-key input (and Backspace) — see PhoneEntry for context.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key >= "0" && e.key <= "9") {
        setError(false);
        setPin((p) => (p.length < len ? p + e.key : p));
        e.preventDefault();
        e.stopPropagation();
      } else if (e.key === "Backspace") {
        setPin((p) => p.slice(0, -1));
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  // Auto-submit once the code is complete. `onSubmit` is a fresh closure every
  // render, so this effect re-runs and re-arms the timer constantly — including
  // on the re-render that setting authBusy causes. Without the ref, a response
  // faster than 600ms lets it submit the same code twice.
  const submittedPin = useRef("");
  useEffect(() => {
    if (pin.length !== len || submittedPin.current === pin) return;
    const t = setTimeout(() => {
      submittedPin.current = pin;
      onSubmit(pin);
    }, 600);
    return () => clearTimeout(t);
  }, [pin, onSubmit]);

  const formatPhone = (raw) => raw ? `+${raw.slice(0, 2)} ${raw.slice(2, 6)} ${raw.slice(6)}` : "your phone";

  return (
    <div className="screen auth">
      <div className="auth-left">
        <div className="auth-eyebrow">
          <Icon name="check" size={14} /> Verify your number
        </div>
        <h1 className="auth-title">
          Enter the
          <br />
          <em>5-digit code.</em>
        </h1>
        <p className="auth-sub">
          We just sent a login code to your Telegram app on another device. It looks like a short number — type it
          here.
        </p>
        <div className="auth-meta">
          <div className="auth-meta-row"><span className="dot"></span> Sent to {formatPhone(phone)}</div>
          <div className="auth-meta-row" style={{ color: "var(--accent-2)" }}>
            <span className="dot" style={{ background: "var(--accent-2)" }}></span>
            {delivery?.current
              ? <>Code sent via {delivery.current}{delivery.timeout ? ` · resendable in ${delivery.timeout}s` : ""}</>
              : <>Awaiting Telegram delivery info…</>}
          </div>
          <div className="auth-meta-row">
            <span className="dot"></span>
            {delivery?.next
              ? <>Resend will use {delivery.next}</>
              : <>Resend will retry the same channel</>}
          </div>
          <div className="auth-meta-row" style={{ color: (error || remoteError) ? "var(--bad)" : undefined }}>
            <span className="dot" style={{ background: (error || remoteError) ? "var(--bad)" : undefined }}></span>
            {remoteError || (error ? "Code must be 5 digits" : "Open Telegram on another device → chat with the \"Telegram\" service account")}
          </div>
          {busy && (
            <div className="auth-meta-row" style={{ color: "var(--accent-2)" }}>
              <span className="dot" style={{ background: "var(--accent-2)" }}></span> Verifying…
            </div>
          )}
        </div>
      </div>
      <div className="auth-right">
        <div className="pin-display">
          <div className="label" style={{ color: error ? "var(--bad)" : undefined }}>Login code</div>
          <div className="pin-dots">
            {Array.from({ length: len }).map((_, i) => {
              const filled = i < pin.length;
              const active = i === pin.length;
              return (
                <div key={i} className={`pin-cell ${filled ? "filled" : ""} ${active ? "active" : ""}`}>
                  {filled ? pin[i] : ""}
                </div>
              );
            })}
          </div>
        </div>
        <Keypad focusedId={focusedId} onPress={handleEnter} />
        <div
          data-focus-id="resend"
          className={`btn focusable ${focusedClass("resend", focusedId)}`}
          onClick={handleResend}
          style={{ minWidth: 200, justifyContent: "center" }}
        >
          {resendStatus === "sending" ? "Sending…" :
           resendStatus === "sent"    ? "Sent ✓"    :
           resendStatus.startsWith("error") ? resendStatus :
                                       "Didn't get it? Resend code"}
        </div>
      </div>
    </div>
  );
}

// =========================================================
// PasswordEntry — cloud-password (2FA)
// =========================================================
export function PasswordEntry({ phone, onSubmit, onBack, busy = false, remoteError = "" }) {
  const [pw, setPw] = useState("");
  const [reveal, setReveal] = useState(false);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Backspace") {
        setPw((p) => p.slice(0, -1));
        e.preventDefault(); e.stopPropagation();
      } else if (e.key === "Enter") {
        if (pw.length >= 1) onSubmit(pw);
        e.preventDefault(); e.stopPropagation();
      } else if (e.key === "Escape") {
        onBack?.();
        e.preventDefault(); e.stopPropagation();
      } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
        // single printable char
        setPw((p) => p + e.key);
        e.preventDefault(); e.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [pw, onSubmit, onBack]);

  const formatPhone = (raw) => raw ? `+${raw.slice(0, 2)} ${raw.slice(2, 6)} ${raw.slice(6)}` : "your phone";

  return (
    <div className="screen auth">
      <div className="auth-left">
        <div className="auth-eyebrow">
          <Icon name="settings" size={14} /> Cloud password
        </div>
        <h1 className="auth-title">
          One more<br/><em>quick step.</em>
        </h1>
        <p className="auth-sub">
          This account has two-step verification turned on. Type the cloud password you set in
          Telegram → Settings → Privacy and Security → Two-Step Verification.
        </p>
        <div className="auth-meta">
          <div className="auth-meta-row"><span className="dot"></span> Signed in as {formatPhone(phone)}</div>
          <div className="auth-meta-row"><span className="dot"></span> Telecast never stores your password</div>
          {busy && (
            <div className="auth-meta-row" style={{ color: "var(--accent-2)" }}>
              <span className="dot" style={{ background: "var(--accent-2)" }}></span> Verifying…
            </div>
          )}
          {remoteError && (
            <div className="auth-meta-row" style={{ color: "var(--bad)" }}>
              <span className="dot" style={{ background: "var(--bad)" }}></span> {remoteError}
            </div>
          )}
        </div>
      </div>
      <div className="auth-right">
        <div className="phone-display" style={{ width: 560 }}>
          <div className="label">Cloud password</div>
          <div className="value" style={{ fontSize: 36, letterSpacing: "0.2em" }}>
            {pw.length === 0 ? (
              <span style={{ color: "var(--text-mute)" }}>•••</span>
            ) : reveal ? pw : "•".repeat(Math.min(pw.length, 24))}
            <span className="cursor"></span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 14 }}>
          <div
            className="btn lg focusable"
            data-focus-id="pw-reveal"
            onClick={() => setReveal((r) => !r)}
          >
            {reveal ? "Hide" : "Show"} password
          </div>
          <div
            className="btn primary lg focusable"
            data-focus-id="pw-ok"
            onClick={() => pw.length >= 1 && onSubmit(pw)}
          >
            <Icon name="check" size={20} /> Continue
          </div>
        </div>
        <div style={{ display: "flex", gap: 14, alignItems: "center", fontSize: 14, color: "var(--text-mute)" }}>
          <span><Icon name="info" size={14}/></span>
          <span>Type with your keyboard · Enter submits · Backspace deletes</span>
        </div>
      </div>
    </div>
  );
}

// =========================================================
// Library — sidebar + content
// =========================================================
// Sidebar tabs. Each id is `nav-<tab>` so the two stay in sync by construction.
// "Saved" used to sit here and silently did nothing when pressed — favorites
// already surface at the top of Chats, so it's gone rather than dead.
// Chat cards per row — the focus grid and the CSS grid must agree, or ← →
// walk to cards that aren't where the user is looking.
const CHAT_COLS = 4;

const NAV_ITEMS = [
  { id: "nav-home", icon: "home", label: "Home" },
  { id: "nav-chats", icon: "chat", label: "Chats" },
  { id: "nav-favorites", icon: "star", label: "Favourites" },
  { id: "nav-search", icon: "search", label: "Search" },
  { id: "nav-settings", icon: "settings", label: "Settings" },
];

export function Library({ tab, setTab, onSelectGroup, onOpenPlayer, onLogout }) {
  const [groups, setGroups] = useState(() => []);
  const [positions, setPositions] = useState({});
  const [favorites, setFavorites] = useState(new Set());
  const [movieFavs, setMovieFavs] = useState(new Set());
  const [update, setUpdate] = useState(null);
  const [me, setMe] = useState(null);
  const [prefs, setPrefs] = useState({ resumeEnabled: true });
  const [installed, setInstalled] = useState({ vlc: false, mx: false });
  const [searchQuery, setSearchQuery] = useState("");
  const [searchGlobal, setSearchGlobal] = useState([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [g, pos, favs, mfavs, user, p, vlc, mx] = await Promise.all([
          getGroups(),
          loadPositions(),
          loadFavorites(),
          loadMovieFavorites(),
          getMe(),
          loadPrefs(),
          isInstalled(PACKAGES.vlc),
          isInstalled(PACKAGES.mx),
        ]);
        if (cancelled) return;
        setGroups(g);
        setPositions(pos);
        setFavorites(new Set(favs));
        setMovieFavs(new Set(mfavs));
        setMe(user);
        setPrefs(p);
        setInstalled({ vlc, mx });
      } catch (err) {
        console.error("library load failed:", err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Advisory update check, once per session. Never blocks or nags modally.
  useEffect(() => {
    let cancelled = false;
    checkForUpdate().then((u) => { if (!cancelled) setUpdate(u); });
    return () => { cancelled = true; };
  }, []);

  const handleToggleResume = async () => {
    const next = await setPref("resumeEnabled", !prefs.resumeEnabled);
    setPrefs({ ...next });
  };
  const handleClearHistory = async () => {
    if (!confirm("Clear all resume positions? This can't be undone.")) return;
    await clearAllPositions();
    setPositions({});
  };

  // (Search input now uses a real <input> in SearchContent — it natively
  // handles IME composition for Hebrew / CJK / etc, pasted text, dead keys
  // and so on. No global key capture needed here.)

  // Debounced global Telegram search.
  useEffect(() => {
    if (tab !== "search") return;
    const q = searchQuery.trim();
    if (q.length < 2) { setSearchGlobal([]); setSearching(false); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try { setSearchGlobal(await searchGlobalMedia(q)); }
      catch (err) { console.error(err); setSearchGlobal([]); }
      finally { setSearching(false); }
    }, 400);
    return () => clearTimeout(t);
  }, [searchQuery, tab]);

  const handleToggleFav = async (gid) => {
    const next = await toggleFavorite(gid);
    setFavorites(new Set(next));
  };

  const handleToggleMovieFav = async (movieId) => {
    if (!movieId) return;
    const next = await toggleMovieFavorite(movieId);
    setMovieFavs(new Set(next));
  };

  // Sort groups: favorites first, otherwise stable.
  const sortedGroups = useMemo(() => {
    if (!favorites.size) return groups;
    return [...groups].sort((a, b) => Number(favorites.has(b.id)) - Number(favorites.has(a.id)));
  }, [groups, favorites]);

  // In-memory matches across the groups we've already loaded.
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return { chats: [], localMedia: [] };
    const chats = sortedGroups.filter((g) => g.name?.toLowerCase().includes(q));
    const localMedia = [];
    for (const g of sortedGroups) {
      for (const mv of g.movies || []) {
        if (mv.title?.toLowerCase().includes(q)) {
          localMedia.push({ movie: mv, sender: g.name, sentAgo: "" });
        }
      }
    }
    return { chats: chats.slice(0, 12), localMedia: localMedia.slice(0, 30) };
  }, [searchQuery, sortedGroups]);

  const homeRows = useMemo(() => {
    // Merge saved positions into movies so the Continue-watching shelf and
    // poster progress bars reflect real history.
    const allMovies = sortedGroups.flatMap((g) => g.movies || []).map((mv) => {
      const p = positions[mv.id];
      if (!p?.sec || !p?.totalSec) return mv;
      return { ...mv, progress: Math.max(0, Math.min(1, p.sec / p.totalSec)) };
    });
    const pool = allMovies;
    const continueWatching = pool
      .filter((m) => m.progress > 0 && m.progress < 1)
      .sort((a, b) => (positions[b.id]?.updatedAt || 0) - (positions[a.id]?.updatedAt || 0))
      .slice(0, 6);
    const latest = (sortedGroups[1]?.movies || sortedGroups[0]?.movies || []).slice(0, 6);
    // HomeContent renders nothing focusable until it has a hero — mirror that
    // here, or the grid hands out focus ids for elements that aren't on screen
    // (pressing OK on invisible focus used to open a random chat).
    const hasHero = Boolean(continueWatching[0] || sortedGroups[0]?.movies?.[0]);
    return {
      grid: hasHero
        ? [
            ["hero-resume", "hero-info"],
            continueWatching.map((_, i) => `cw-${i}`),
            sortedGroups.map((_, i) => `chats-${i}`),
            latest.map((_, i) => `latest-${i}`),
          ]
        : [],
      continueWatching,
      latest,
    };
  }, [sortedGroups, positions]);

  // Favourited movies, resolved against the chats already scanned this session
  // — same constraint Continue-watching lives under.
  const favEntries = useMemo(() => {
    if (!movieFavs.size) return [];
    const out = [];
    for (const g of sortedGroups) {
      for (const mv of g.movies || []) {
        if (movieFavs.has(mv.id)) out.push({ movie: mv, sender: g.name, sentAgo: "" });
      }
    }
    return out;
  }, [sortedGroups, movieFavs]);

  const favoritesRows = useMemo(() => {
    const rows = [];
    for (let i = 0; i < favEntries.length; i += 5) {
      rows.push(favEntries.slice(i, i + 5).map((_, k) => `fav-${i + k}`));
    }
    return rows;
  }, [favEntries]);

  const chatsRows = useMemo(() => {
    const cols = CHAT_COLS;
    const rows = [];
    for (let i = 0; i < sortedGroups.length; i += cols) {
      rows.push(sortedGroups.slice(i, i + cols).map((_, k) => `chat-${i + k}`));
    }
    return rows;
  }, [sortedGroups]);

  const settingsRows = useMemo(
    () => [["s-acct"], ["s-resume"], ["s-ext"], ["s-clear-history"], ["s-logout"], ["s-exit"]],
    []
  );

  const searchRows = useMemo(() => {
    const rows = [["search-input"]];
    // Matching chats — 2 columns
    for (let i = 0; i < searchResults.chats.length; i += CHAT_COLS) {
      rows.push(searchResults.chats.slice(i, i + CHAT_COLS).map((_, k) => `sg-${i + k}`));
    }
    // Local media + global media — 5 columns each
    for (let i = 0; i < searchResults.localMedia.length; i += 5) {
      rows.push(searchResults.localMedia.slice(i, i + 5).map((_, k) => `sm-${i + k}`));
    }
    for (let i = 0; i < searchGlobal.length; i += 5) {
      rows.push(searchGlobal.slice(i, i + 5).map((_, k) => `sgm-${i + k}`));
    }
    return rows;
  }, [searchResults, searchGlobal]);

  const contentRows =
    tab === "chats"     ? chatsRows :
    tab === "favorites" ? favoritesRows :
    tab === "settings"  ? settingsRows :
    tab === "search"    ? searchRows :
                          homeRows.grid;

  // Focus id -> the movie behind it, for the long-press favourite toggle.
  // Deliberately separate from handleEnter: that function also decides *where
  // to navigate*, and threading a second meaning through it would be a much
  // riskier edit than a small lookup that only long-press uses.
  const movieForId = (id) => {
    if (!id) return null;
    if (id === "hero-resume" || id === "hero-info") {
      return homeRows.continueWatching[0] || sortedGroups[0]?.movies?.[0] || null;
    }
    if (id.startsWith("cw-")) return homeRows.continueWatching[parseInt(id.slice(3))] || null;
    if (id.startsWith("latest-")) return homeRows.latest[parseInt(id.slice(7))] || null;
    if (id.startsWith("sm-")) return searchResults.localMedia[parseInt(id.slice(3))]?.movie || null;
    if (id.startsWith("sgm-")) return searchGlobal[parseInt(id.slice(4))]?.movie || null;
    if (id.startsWith("fav-")) return favEntries[parseInt(id.slice(4))]?.movie || null;
    return null; // chats, nav and settings rows have no movie
  };

  const handleLongEnter = (id) => {
    const mv = movieForId(id);
    if (mv) handleToggleMovieFav(mv.id);
  };

  const handleEnter = (id) => {
    if (id?.startsWith("nav-")) {
      setTab(id.slice(4));
    } else if (id === "search-input") {
      /* focus is handed to the real <input> by SearchContent */
    } else if (id?.startsWith("sg-")) {
      const g = searchResults.chats[parseInt(id.slice(3))];
      if (g) onSelectGroup(g);
    } else if (id?.startsWith("sm-")) {
      const entry = searchResults.localMedia[parseInt(id.slice(3))];
      if (entry) onOpenPlayer(entry.movie, { group: { name: entry.sender, avatar: "TG", palette: "linear-gradient(135deg,#2ea6ff,#5fc1ff)" }, sender: "—", resume: false });
    } else if (id?.startsWith("sgm-")) {
      const entry = searchGlobal[parseInt(id.slice(4))];
      if (entry) onOpenPlayer(entry.movie, { group: { name: "Telegram", avatar: "TG", palette: "linear-gradient(135deg,#2ea6ff,#5fc1ff)" }, sender: entry.sender || "—", resume: false });
    } else if (id === "hero-resume") {
      const hero = homeRows.continueWatching[0];
      if (hero) onOpenPlayer(hero, { group: sortedGroups[0], sender: "—", resume: true });
    } else if (id?.startsWith("cw-")) {
      const idx = parseInt(id.slice(3));
      const mv = homeRows.continueWatching[idx];
      if (mv) onOpenPlayer(mv, { group: sortedGroups[0], sender: "—", resume: true });
    } else if (id?.startsWith("chats-")) {
      onSelectGroup(sortedGroups[parseInt(id.slice(6))]);
    } else if (id?.startsWith("chat-")) {
      onSelectGroup(sortedGroups[parseInt(id.slice(5))]);
    } else if (id?.startsWith("latest-")) {
      const idx = parseInt(id.slice(7));
      const mv = homeRows.latest[idx];
      if (mv) onOpenPlayer(mv, { group: sortedGroups[1] || sortedGroups[0], sender: "—", resume: false });
    } else if (id?.startsWith("fav-")) {
      const entry = favEntries[parseInt(id.slice(4))];
      if (entry) {
        onOpenPlayer(entry.movie, {
          group: { name: entry.sender, avatar: "TG", palette: "linear-gradient(135deg,#2ea6ff,#5fc1ff)" },
          sender: "—",
          resume: true,
        });
      }
    } else if (id === "s-resume") {
      handleToggleResume();
    } else if (id === "s-clear-history") {
      handleClearHistory();
    } else if (id === "s-logout") {
      onLogout?.();
    } else if (id === "s-exit") {
      if (confirm("Exit Telecast?")) exitApp();
    }
  };

  // Two focus zones, because the sidebar is a vertical column beside a grid:
  // modelling both as one grid made ↓ from "Home" jump into the content and
  // → walk down the sidebar. Sidebar owns ↑↓; → enters the content, ← and
  // BACK come back to it.
  const [zone, setZone] = useState("nav");
  const navRows = useMemo(() => NAV_ITEMS.map((it) => [it.id]), []);
  const hasContent = contentRows.some((r) => r.length);

  const { focusedId: navFocused } = useFocusGrid(navRows, {
    onEnter: handleEnter,
    onEdgeRight: () => { if (hasContent) setZone("content"); },
    enabled: zone === "nav",
    initial: "nav-home",
  });
  const { focusedId: contentFocused, setPos: setContentPos } = useFocusGrid(contentRows, {
    onEnter: handleEnter,
    // Only the content grid opts into long-press, so the sidebar keeps
    // reacting to OK on keydown.
    onLongEnter: handleLongEnter,
    onEdgeLeft: () => setZone("nav"),
    onBack: () => setZone("nav"),
    enabled: zone === "content",
  });
  const focusedId = zone === "nav" ? navFocused : contentFocused;

  // Switching tabs re-enters at the top of the new content, and drops focus
  // back to the sidebar when the new tab has nothing focusable.
  useEffect(() => {
    setContentPos({ r: 0, c: 0 });
    if (!hasContent) setZone("nav");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, hasContent]);

  // Click delegation — every focusable carries data-focus-id; a click anywhere
  // inside the screen finds the closest one and runs the same handler the
  // D-pad Enter would.
  const onScreenClick = (e) => {
    const id = e.target.closest?.("[data-focus-id]")?.dataset.focusId;
    if (id) handleEnter(id);
  };

  return (
    <div className="screen library" onClick={onScreenClick}>
      <Sidebar focusedId={focusedId} tab={tab} me={me} update={update} />
      <div className="content">
        {tab === "home" && (
          <HomeContent
            focusedId={focusedId}
            groups={sortedGroups}
            continueWatching={homeRows.continueWatching}
            latest={homeRows.latest}
            favorites={favorites}
            onToggleFav={handleToggleFav}
            movieFavs={movieFavs}
          />
        )}
        {tab === "chats" && (
          <ChatsContent
            focusedId={focusedId}
            groups={sortedGroups}
            favorites={favorites}
            onToggleFav={handleToggleFav}
          />
        )}
        {tab === "favorites" && (
          <FavoritesContent focusedId={focusedId} entries={favEntries} movieFavs={movieFavs} />
        )}
        {tab === "settings" && (
          <SettingsContent
            focusedId={focusedId}
            me={me}
            prefs={prefs}
            installed={installed}
            positionsCount={Object.keys(positions).length}
            favoritesCount={favorites.size}
            update={update}
          />
        )}
        {tab === "search" && (
          <SearchContent
            focusedId={focusedId}
            query={searchQuery}
            setQuery={setSearchQuery}
            chats={searchResults.chats}
            localMedia={searchResults.localMedia}
            globalMedia={searchGlobal}
            searching={searching}
            favorites={favorites}
            onToggleFav={handleToggleFav}
            movieFavs={movieFavs}
          />
        )}
      </div>
    </div>
  );
}

function Sidebar({ focusedId, tab, me, update }) {
  return (
    <div className="sidebar">
      {NAV_ITEMS.map((it) => {
        const active = it.id === `nav-${tab}`;
        return (
          <div
            key={it.id}
            data-focus-id={it.id}
            className={`nav-item focusable ${active ? "active" : ""} ${focusedClass(it.id, focusedId)}`}
          >
            <span className="nav-icon"><Icon name={it.icon} size={20} /></span>
            <span>{it.label}</span>
            {active && !focusedId?.startsWith("nav-") && <span className="indicator"></span>}
          </div>
        );
      })}
      {update?.updateAvailable && (
        <div className="sidebar-update">
          <Icon name="download" size={14} />
          <span>Version {update.latestName} available</span>
        </div>
      )}
      {me && (
        <div className="sidebar-foot">
          <div className="avatar" style={{ background: me.avatarColor }}>{me.avatar}</div>
          <div>
            <div style={{ color: "var(--text)", fontWeight: 500 }}>{me.name}</div>
            <div>{me.phone || `@${me.username}`}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function HomeContent({ focusedId, groups, continueWatching, latest, favorites, onToggleFav, movieFavs }) {
  const hero = continueWatching[0] || groups[0]?.movies?.[0];
  const heroArt = useArt(hero);
  const heroGroup = groups[0] || { name: "Telegram", avatar: "TG", palette: "linear-gradient(135deg,#2ea6ff,#5fc1ff)" };
  if (!hero) {
    // First-load empty state — no media discovered in any group yet.
    return (
      <div className="content-scroll" style={{ display: "grid", placeItems: "center", color: "var(--text-mute)" }}>
        <div style={{ textAlign: "center", maxWidth: 540 }}>
          <h3 style={{ fontFamily: "var(--f-display)", fontSize: 28, color: "var(--text)" }}>No detected media yet</h3>
          <p style={{ marginTop: 12 }}>
            Open a chat from the sidebar — Telecast scans the latest 200 messages for video files, streams, magnet links, and YouTube URLs. Items show up here after a chat has been opened at least once.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="content-scroll">
      <div className="hero">
        <div className="hero-bg" style={{ background: heroArt }}></div>
        <div className="hero-grad"></div>
        <div className="hero-body">
          <div style={{ maxWidth: 760 }}>
            <div className="hero-tag">
              <span style={{ width: 8, height: 8, borderRadius: 50, background: "var(--accent-2)" }}></span>
              Continue watching
            </div>
            <h2 className="hero-title">{hero.title}</h2>
            <div className="hero-meta">
              <span className="pill">{hero.rating}</span>
              <span>{hero.year}</span>
              <span>·</span>
              <span>{formatRuntime(hero.runtime)}</span>
              <span>·</span>
              <span>{hero.quality}</span>
            </div>
            <div className="hero-source">
              <span className="src-avatar" style={{ background: heroGroup.palette }}>{heroGroup.avatar}</span>
              <span>
                From <strong style={{ color: "var(--text)" }}>{heroGroup.name}</strong> · shared by Sasha ·{" "}
                {Math.round((1 - hero.progress) * hero.runtime)}m left
              </span>
            </div>
            <div className="hero-progress">
              <div style={{ width: `${hero.progress * 100}%` }} />
            </div>
          </div>
          <div className="hero-actions">
            <div data-focus-id="hero-resume" className={`btn primary lg focusable ${focusedClass("hero-resume", focusedId)}`}>
              <Icon name="play" size={20} />
              Resume
            </div>
            <div data-focus-id="hero-info" className={`btn lg focusable ${focusedClass("hero-info", focusedId)}`}>
              <Icon name="info" size={20} />
              More
            </div>
          </div>
        </div>
      </div>

      <div className="shelf">
        <div className="shelf-head">
          <h3>Continue watching</h3>
          <span className="shelf-sub">Across your chats</span>
        </div>
        <div className="shelf-row">
          {continueWatching.map((mv, i) => {
            const sourceGroup =
              groups.find((g) => (g.movieIds || []).includes(mv.id)) || groups[0] || heroGroup;
            return (
              <Poster
                key={mv.id}
                movie={mv}
                focusId={`cw-${i}`}
                focused={focusedId === `cw-${i}`}
                showProgress
                isFavorite={movieFavs.has(mv.id)}
                source={{ initials: sourceGroup.avatar, color: sourceGroup.palette, name: sourceGroup.name }}
              />
            );
          })}
        </div>
      </div>

      <div className="shelf">
        <div className="shelf-head">
          <h3>Your chats with media</h3>
          <span className="shelf-sub">
            {groups.length} groups · {groups.reduce((n, g) => n + (g.movies?.length || 0), 0)} titles
          </span>
        </div>
        <div className="shelf-row">
          {groups.map((g, i) => (
            <ChatCard
              key={g.id}
              group={g}
              focusId={`chats-${i}`}
              focused={focusedId === `chats-${i}`}
              isFavorite={favorites.has(g.id)}
              onToggleFav={() => onToggleFav(g.id)}
            />
          ))}
        </div>
      </div>

      {latest.length > 0 && (
        <div className="shelf">
          <div className="shelf-head">
            <h3>Latest in {groups[1]?.name || groups[0]?.name || "your chats"}</h3>
            <span className="shelf-sub">Recently shared</span>
          </div>
          <div className="shelf-row">
            {latest.map((mv, i) => (
              <Poster
                key={mv.id}
                movie={mv}
                focusId={`latest-${i}`}
                focused={focusedId === `latest-${i}`}
                isFavorite={movieFavs.has(mv.id)}
                source={{ initials: heroGroup.avatar, color: heroGroup.palette, name: heroGroup.name }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ChatsContent({ focusedId, groups, favorites, onToggleFav }) {
  return (
    <div className="content-scroll" style={{ paddingTop: 8 }}>
      <div className="shelf-head" style={{ marginBottom: 22 }}>
        <h3 style={{ fontSize: 36 }}>Chats</h3>
        <span className="shelf-sub">Groups, channels and private chats · ⭐ favorites first</span>
      </div>
      <div className="chat-grid" style={{ "--chat-cols": CHAT_COLS }}>
        {groups.map((g, i) => (
          <ChatCard
            key={g.id}
            group={g}
            focusId={`chat-${i}`}
            focused={focusedId === `chat-${i}`}
            isFavorite={favorites.has(g.id)}
            onToggleFav={() => onToggleFav(g.id)}
          />
        ))}
      </div>
    </div>
  );
}

function FavoritesContent({ focusedId, entries, movieFavs }) {
  if (!entries.length) {
    return (
      <div className="content-scroll">
        <div style={{ display: "grid", placeItems: "center", height: "70%", textAlign: "center" }}>
          <div>
            <h3 style={{ fontFamily: "var(--f-display)", fontSize: 34, margin: "0 0 12px" }}>
              No favourites yet
            </h3>
            <p style={{ color: "var(--text-dim)", maxWidth: 560, margin: "0 auto", lineHeight: 1.5 }}>
              Hold <strong>OK</strong> on any movie for a moment to star it, and it shows up here.
              {movieFavs.size > 0 && (
                <>
                  <br />
                  You have {movieFavs.size} starred in chats this session hasn’t scanned yet — open
                  those chats and they’ll appear.
                </>
              )}
            </p>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="content-scroll" style={{ paddingTop: 8 }}>
      <div className="shelf-head" style={{ marginBottom: 22 }}>
        <h3 style={{ fontSize: 36 }}>Favourites</h3>
        <span className="shelf-sub">{entries.length} starred · hold OK on a card to remove</span>
      </div>
      <div className="search-media-grid">
        {entries.map((entry, i) => (
          <MediaCard
            key={entry.movie.id}
            entry={entry}
            focusId={`fav-${i}`}
            focused={focusedId === `fav-${i}`}
            isFavorite
          />
        ))}
      </div>
    </div>
  );
}

function SettingsContent({ focusedId, me, prefs, installed, positionsCount, favoritesCount, update }) {
  const installedCount = (installed?.vlc ? 1 : 0) + (installed?.mx ? 1 : 0) + 1; // +1 for system
  const extDetail = [
    installed?.vlc ? "VLC ✓" : "VLC —",
    installed?.mx ? "MX ✓" : "MX —",
    "System ✓",
  ].join(" · ");

  return (
    <div className="content-scroll">
      <div className="settings">
        <div>
          <h1 className="settings-h1">Settings</h1>
          <div data-focus-id="s-acct" className={`settings-profile focusable ${focusedClass("s-acct", focusedId)}`}>
            <div className="avatar" style={{ background: me?.avatarColor || "linear-gradient(135deg,#2ea6ff,#5fc1ff)" }}>{me?.avatar || "?"}</div>
            <div className="name">{me?.name || "Loading…"}</div>
            <div className="phone">{me?.phone || (me?.username ? `@${me.username}` : "")}</div>
            <div style={{ display: "flex", justifyContent: "center", gap: 8, fontSize: 13, color: "var(--accent-2)" }}>
              <span style={{ width: 6, height: 6, borderRadius: 50, background: "var(--good)", display: "inline-block", marginTop: 6 }}></span>
              Signed in
            </div>
            <div style={{ marginTop: 16, fontSize: 12, color: "var(--text-mute)" }}>
              {favoritesCount} favorited · {positionsCount} watch positions saved
            </div>
          </div>
        </div>
        <div>
          <div style={{ height: 76 }}></div>
          <div className="settings-group-title">Playback</div>
          <div className="settings-list">
            <div data-focus-id="s-resume" className={`settings-row focusable ${focusedClass("s-resume", focusedId)}`}>
              <div>
                <div className="sr-title">Resume where you left off</div>
                <div className="sr-sub">Restart videos from where you stopped them</div>
              </div>
              <div className={`switch ${prefs?.resumeEnabled ? "on" : ""}`}></div>
            </div>
          </div>

          <div className="settings-group-title">External players</div>
          <div className="settings-list">
            <div data-focus-id="s-ext" className={`settings-row focusable ${focusedClass("s-ext", focusedId)}`}>
              <div>
                <div className="sr-title">Installed players</div>
                <div className="sr-sub">{extDetail}</div>
              </div>
              <div className="sr-value">{installedCount} available</div>
            </div>
          </div>

          <div className="settings-group-title">Account</div>
          <div className="settings-list">
            <div data-focus-id="s-clear-history" className={`settings-row focusable ${focusedClass("s-clear-history", focusedId)}`}>
              <div>
                <div className="sr-title">Clear watch history</div>
                <div className="sr-sub">Remove all saved resume positions ({positionsCount})</div>
              </div>
              <Icon name="bksp" size={20} />
            </div>
            <div data-focus-id="s-logout" className={`settings-row focusable ${focusedClass("s-logout", focusedId)}`}>
              <div>
                <div className="sr-title" style={{ color: "var(--bad)" }}>Sign out of Telegram</div>
                <div className="sr-sub">Removes session from this TV only</div>
              </div>
              <Icon name="logout" size={20} />
            </div>
          </div>

          <div className="settings-group-title">App</div>
          <div className="settings-list">
            <div data-focus-id="s-exit" className={`settings-row focusable ${focusedClass("s-exit", focusedId)}`}>
              <div>
                <div className="sr-title">Exit Telecast</div>
                <div className="sr-sub">Close the app and return to the TV home screen</div>
              </div>
              <Icon name="open" size={20} />
            </div>
            {/* Not focusable — there's nothing to activate, so it stays out of
                the D-pad grid rather than adding a dead stop. */}
            <div className="settings-row">
              <div>
                <div className="sr-title">Version</div>
                <div className="sr-sub">
                  {update === null
                    ? "Telegram media player for Android TV"
                    : update.updateAvailable
                      ? `Version ${update.latestName} is available${update.notes ? ` — ${update.notes}` : ""}${
                          update.downloaderCode ? `. Open Downloader and enter ${update.downloaderCode}.` : ""
                        }`
                      : "Up to date"}
                </div>
              </div>
              <div
                className="sr-value"
                style={update?.updateAvailable ? { color: "var(--warn)", fontWeight: 600 } : undefined}
              >
                {import.meta.env.VITE_APP_VERSION} ({import.meta.env.VITE_APP_BUILD})
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// =========================================================
// SearchContent — universal search across chats + Telegram videos
// =========================================================
function SearchContent({ focusedId, query, setQuery, chats, localMedia, globalMedia, searching, favorites, onToggleFav, movieFavs }) {
  const inputRef = useRef(null);
  const hasQuery = query.trim().length > 0;
  const empty = hasQuery && chats.length === 0 && localMedia.length === 0 && globalMedia.length === 0 && !searching;

  // The input is a member of the focus grid ("search-input" is its first row),
  // so hand the real DOM focus over whenever the grid lands on it — that's
  // what lets ↓ walk out into the results and ↑ come back to typing.
  useEffect(() => {
    if (focusedId === "search-input") inputRef.current?.focus();
  }, [focusedId]);

  return (
    <div className="content-scroll" style={{ paddingTop: 8 }}>
      <div className={`search-bar focusable ${focusedClass("search-input", focusedId)}`} data-focus-id="search-input">
        <Icon name="search" size={28} />
        <input
          ref={inputRef}
          type="text"
          className="search-bar-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search videos & chats…"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          dir="auto"
        />
        {searching && <span className="search-spinner" />}
      </div>

      {!hasQuery && (
        <div style={{ padding: "60px 0", textAlign: "center", color: "var(--text-mute)" }}>
          <p style={{ fontSize: 18 }}>Type anything — Hebrew, English, mixed — Enter searches.</p>
          <p style={{ marginTop: 6, fontSize: 14 }}>
            Matches both your already-loaded chats and Telegram-wide video search.
          </p>
        </div>
      )}

      {chats.length > 0 && (
        <div className="shelf">
          <div className="shelf-head">
            <h3>Chats</h3>
            <span className="shelf-sub">{chats.length} match{chats.length === 1 ? "" : "es"}</span>
          </div>
          <div className="chat-grid" style={{ "--chat-cols": CHAT_COLS }}>
            {chats.map((g, i) => (
              <ChatCard
                key={g.id}
                group={g}
                focusId={`sg-${i}`}
                focused={focusedId === `sg-${i}`}
                isFavorite={favorites.has(g.id)}
                onToggleFav={() => onToggleFav(g.id)}
              />
            ))}
          </div>
        </div>
      )}

      {localMedia.length > 0 && (
        <div className="shelf">
          <div className="shelf-head">
            <h3>From your chats</h3>
            <span className="shelf-sub">{localMedia.length} item{localMedia.length === 1 ? "" : "s"}</span>
          </div>
          <div className="search-media-grid">
            {localMedia.map((e, i) => (
              <MediaCard key={`sm-${i}-${e.movie.id}`} entry={e} focusId={`sm-${i}`} focused={focusedId === `sm-${i}`} isFavorite={movieFavs.has(e.movie.id)} />
            ))}
          </div>
        </div>
      )}

      {globalMedia.length > 0 && (
        <div className="shelf">
          <div className="shelf-head">
            <h3>Across Telegram</h3>
            <span className="shelf-sub">{globalMedia.length} videos found{searching ? " · refining…" : ""}</span>
          </div>
          <div className="search-media-grid">
            {globalMedia.map((e, i) => (
              <MediaCard key={`sgm-${i}-${e.movie.id}`} entry={e} focusId={`sgm-${i}`} focused={focusedId === `sgm-${i}`} isFavorite={movieFavs.has(e.movie.id)} />
            ))}
          </div>
        </div>
      )}

      {empty && (
        <div style={{ padding: "60px 0", textAlign: "center", color: "var(--text-mute)" }}>
          <p style={{ fontSize: 18 }}>No results for “{query}”.</p>
          <p style={{ marginTop: 6, fontSize: 14 }}>
            Try a different spelling, or open the chat directly from the Chats tab.
          </p>
        </div>
      )}
    </div>
  );
}

// =========================================================
// Group Detail
// =========================================================
export function GroupDetail({ group, onBack, onOpenMovie }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  // Its own copy: this screen sits outside Library, and loadMovieFavorites()
  // is cached module-side so this costs nothing after the first read.
  const [movieFavs, setMovieFavs] = useState(new Set());
  useEffect(() => {
    let cancelled = false;
    loadMovieFavorites().then((s) => { if (!cancelled) setMovieFavs(new Set(s)); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const e = await getMedia(group.id);
        if (!cancelled) setEntries(e);
      } catch (err) {
        console.error("getMedia failed:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [group.id]);

  const cols = 5;

  const rows = useMemo(() => {
    const tabsRow = ["tab-all", "tab-movies", "tab-shows", "tab-docs"];
    const gridRows = [];
    for (let i = 0; i < entries.length; i += cols) {
      gridRows.push(entries.slice(i, i + cols).map((_, k) => `mc-${i + k}`));
    }
    return [tabsRow, ...gridRows];
  }, [entries]);

  const handleEnter = (id) => {
    if (id?.startsWith("mc-")) {
      const idx = parseInt(id.slice(3));
      const entry = entries[idx];
      if (entry) onOpenMovie(entry);
    }
  };

  // Hold OK to star, same gesture as the shelves on Home.
  const handleLongEnter = async (id) => {
    if (!id?.startsWith("mc-")) return;
    const entry = entries[parseInt(id.slice(3))];
    if (!entry) return;
    setMovieFavs(new Set(await toggleMovieFavorite(entry.movie.id)));
  };

  const { focusedId } = useFocusGrid(rows, {
    onEnter: handleEnter,
    onLongEnter: handleLongEnter,
    onBack,
    initial: "mc-0",
  });

  const onScreenClick = (e) => {
    const id = e.target.closest?.("[data-focus-id]")?.dataset.focusId;
    if (id) handleEnter(id);
  };

  return (
    <div className="screen group-detail" onClick={onScreenClick}>
      <div className="group-back" onClick={onBack}>
        <Icon name="chevL" size={18} /> Back to chats
      </div>
      <div className="group-header">
        <div className="gh-bg" style={{ background: group.palette }}></div>
        <div className="gh-grad"></div>
        <div className="gh-content">
          <div className="gh-avatar" style={{ background: group.palette }}>{group.avatar}</div>
          <div className="gh-info">
            {/* Was hardcoded "Group · Telegram", which was wrong the moment
                channels existed and wronger once DMs did. */}
            <div className="gh-eyebrow">{group.description || "Telegram"}</div>
            <h1 className="gh-title">{group.name}</h1>
            <div className="gh-meta">
              {group.members > 0 && (
                <>
                  <span>{group.members.toLocaleString()} members</span>
                  <span className="sep">·</span>
                </>
              )}
              <span>{group.movies.length} movies detected</span>
              <span className="sep">·</span>
              <span>{group.description}</span>
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className="group-tabs">
          <div data-focus-id="tab-all" className={`gt focusable active ${focusedClass("tab-all", focusedId)}`}>
            All media <span className="count">{entries.length}</span>
          </div>
          <div data-focus-id="tab-movies" className={`gt focusable ${focusedClass("tab-movies", focusedId)}`}>
            Movies <span className="count">{entries.length}</span>
          </div>
          <div data-focus-id="tab-shows" className={`gt focusable ${focusedClass("tab-shows", focusedId)}`}>
            Shows <span className="count">0</span>
          </div>
          <div data-focus-id="tab-docs" className={`gt focusable ${focusedClass("tab-docs", focusedId)}`}>
            Files <span className="count">{entries.filter((e) => e.movie.type === "file").length}</span>
          </div>
        </div>

        <div className="media-grid">
          {loading && entries.length === 0 && (
            <div style={{ gridColumn: "span 5", color: "var(--text-mute)", padding: "40px 0" }}>
              Loading messages…
            </div>
          )}
          {!loading && entries.length === 0 && (
            <div style={{ gridColumn: "span 5", color: "var(--text-mute)", padding: "40px 0" }}>
              No detected media in this chat yet.
            </div>
          )}
          {entries.map((entry, i) => (
            <MediaCard key={entry.movie.id + i} entry={entry} focusId={`mc-${i}`} focused={focusedId === `mc-${i}`} isFavorite={movieFavs.has(entry.movie.id)} />
          ))}
        </div>
      </div>
    </div>
  );
}

// =========================================================
// Player
// =========================================================
export function Player({ context, onBack, onOpenExternal, onResolvedUrl, onControlsChange }) {
  const { movie, group, sender, resume } = context;
  const totalSecFallback = movie.runtime * 60;
  const art = useArt(movie);

  const [playing, setPlaying] = useState(true);
  // Initial position: 0; we override from saved storage once it loads.
  const [current, setCurrent] = useState(0);
  const initialSeekApplied = useRef(false);

  // Track the resumeEnabled preference. When off, we don't seek to a saved
  // position and we don't write new ones.
  const resumeEnabledRef = useRef(true);

  // Load saved position + preference on mount, if any. Falls back to the
  // legacy `movie.progress` field if no saved record exists.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [saved, p] = await Promise.all([getPosition(movie.id), loadPrefs()]);
      if (cancelled) return;
      resumeEnabledRef.current = p.resumeEnabled !== false;
      if (!resumeEnabledRef.current) return; // honour the toggle
      let startSec = 0;
      if (saved?.sec) startSec = saved.sec;
      else if (resume && movie.progress) startSec = Math.floor(totalSecFallback * movie.progress);
      if (startSec > 0) setCurrent(startSec);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movie.id]);
  const [duration, setDuration] = useState(totalSecFallback);
  const [showSubs, setShowSubs] = useState(true);
  const [muted, setMuted] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [showControls, setShowControls] = useState(true);
  // Bumped on every button press / keypress so the auto-hide countdown
  // restarts on interaction rather than on playback progress.
  const [activity, setActivity] = useState(0);
  const poke = () => { setShowControls(true); setActivity((a) => a + 1); };
  const [loading, setLoading] = useState(true);
  const [resolved, setResolved] = useState(null); // { kind, url } | { kind:"unsupported", reason }
  const videoRef = useRef(null);
  const hideTimer = useRef(null);

  // Resolve a playable URL for the current movie.
  useEffect(() => {
    let cancelled = false;
    let blobToRevoke = null;
    setLoading(true);
    (async () => {
      try {
        const r = await resolveMediaUrl(movie);
        if (cancelled) return;
        setResolved(r);
        // Surface the resolved URL so the external-picker hand-off can use it.
        if (r.url) onResolvedUrl?.(r.url); else onResolvedUrl?.(null);
        if (r.kind === "video") blobToRevoke = r.url.startsWith("blob:") ? r.url : null;
      } catch (err) {
        console.error("resolveMediaUrl failed:", err);
        if (!cancelled) setResolved({ kind: "unsupported", reason: String(err) });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (blobToRevoke) URL.revokeObjectURL(blobToRevoke);
    };
  }, [movie]);

  // Simulated tick (used when no real video is playing — i.e. mock data, YouTube, or unsupported).
  const useFakeTick = !resolved || resolved.kind !== "video";
  const totalSec = duration || totalSecFallback;
  useEffect(() => {
    if (!useFakeTick) return;
    if (!playing || loading) return;
    const t = setInterval(() => setCurrent((c) => Math.min(totalSec, c + 1)), 1000);
    return () => clearInterval(t);
  }, [useFakeTick, playing, loading, totalSec]);

  // Real <video> wiring
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => setCurrent(Math.floor(v.currentTime));
    const onMeta = () => {
      setDuration(Math.floor(v.duration || totalSecFallback));
      // Apply the saved-position seek the first time metadata is ready.
      if (!initialSeekApplied.current && current > 0 && Number.isFinite(v.duration)) {
        try { v.currentTime = Math.min(current, v.duration - 1); } catch (_) { /* ignore */ }
        initialSeekApplied.current = true;
      }
    };
    const onWait     = () => setBuffering(true);
    const onPlaying  = () => setBuffering(false);
    const onStalled  = () => setBuffering(true);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("waiting", onWait);
    v.addEventListener("stalled", onStalled);
    v.addEventListener("playing", onPlaying);
    v.addEventListener("canplay", onPlaying);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("waiting", onWait);
      v.removeEventListener("stalled", onStalled);
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("canplay", onPlaying);
    };
  }, [resolved, totalSecFallback, current]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (playing) v.play().catch(() => {});
    else v.pause();
  }, [playing, resolved]);

  // Sync mute toggle + crank volume on first attach in case the WebView
  // started us at 0.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = muted;
    v.volume = 1;
  }, [muted, resolved]);

  useEffect(() => {
    if (!showControls || !playing) return;
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowControls(false), 5000);
    return () => clearTimeout(hideTimer.current);
    // Keyed on user activity, NOT on `current`: playback ticks that field ~4×
    // a second, and depending on it restarted the timer every tick so the
    // controls never hid while a video was playing.
  }, [showControls, playing, activity]);

  // The app-wide hint bar sits over the bottom of the picture, so it hides and
  // returns together with the player's own chrome.
  useEffect(() => {
    onControlsChange?.(showControls);
    return () => onControlsChange?.(true);
  }, [showControls, onControlsChange]);

  // Persist resume position. Throttle to once every 5s during playback, and
  // also write a final value when the screen unmounts (back button etc.).
  // Skipped entirely when the resume preference is off.
  const lastSavedRef = useRef(0);
  useEffect(() => {
    if (!resumeEnabledRef.current) return;
    if (!playing || current <= 0) return;
    const now = Date.now();
    if (now - lastSavedRef.current < 5000) return;
    lastSavedRef.current = now;
    savePosition(movie.id, current, duration);
  }, [current, playing, duration, movie.id]);
  useEffect(() => {
    return () => {
      if (!resumeEnabledRef.current) return;
      // Write the latest position on unmount so back/quit doesn't lose it.
      // Guard with the ref so we don't overwrite a position with 0 mid-load.
      if (initialSeekApplied.current || current > 5) {
        savePosition(movie.id, current, duration);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Real subtitles: tracks resolved alongside the video URL. Toggle flips
  // the WebVTT track's mode on/off.
  const tracks = resolved?.tracks || [];
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const tt = v.textTracks;
    for (let i = 0; i < tt.length; i++) {
      tt[i].mode = showSubs && i === 0 ? "showing" : "hidden";
    }
  }, [showSubs, resolved, tracks.length]);

  // "No subtitles found" is a one-off notice, not a permanent caption — let it
  // sit over the picture for a few seconds, then get out of the way.
  const [subsNotice, setSubsNotice] = useState(true);
  useEffect(() => {
    setSubsNotice(true);
    const t = setTimeout(() => setSubsNotice(false), 5000);
    return () => clearTimeout(t);
  }, [resolved]);

  const rows = useMemo(
    () => [["back"], ["progress"], ["pa-back", "pa-play", "pa-fwd", "pa-mute", "pa-subs", "pa-ext"]],
    []
  );

  const seek = (delta) => {
    const v = videoRef.current;
    if (v && resolved?.kind === "video") {
      v.currentTime = Math.max(0, Math.min(v.duration || totalSec, v.currentTime + delta));
    } else {
      setCurrent((c) => Math.max(0, Math.min(totalSec, c + delta)));
    }
  };

  const handleEnter = (id) => {
    poke();
    if (id === "pa-play") setPlaying((p) => !p);
    else if (id === "pa-back") seek(-10);
    else if (id === "pa-fwd") seek(10);
    else if (id === "pa-mute") setMuted((m) => !m);
    else if (id === "pa-subs") setShowSubs((s) => !s);
    else if (id === "pa-ext") onOpenExternal();
    else if (id === "back") onBack();
  };

  const { focusedId } = useFocusGrid(rows, { onEnter: handleEnter, onBack, initial: "pa-play" });
  const fId = focusedId;

  useEffect(() => {
    const onKey = (e) => {
      if (fId === "progress") {
        if (e.key === "ArrowRight") { seek(30); e.preventDefault(); e.stopPropagation(); }
        else if (e.key === "ArrowLeft") { seek(-30); e.preventDefault(); e.stopPropagation(); }
      }
      poke();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fId, totalSec, resolved]);

  const pct = (current / totalSec) * 100;

  const onScreenClick = (e) => {
    const id = e.target.closest?.("[data-focus-id]")?.dataset.focusId;
    if (id) handleEnter(id);
  };

  return (
    <div className="screen player" onClick={onScreenClick}>
      {/* Real video if we resolved one; otherwise the gradient canvas the design uses. */}
      {resolved?.kind === "video" ? (
        <video
          ref={videoRef}
          className="player-canvas"
          src={resolved.url}
          autoPlay
          playsInline
          // Explicit so the WebView doesn't infer muted from autoplay heuristics
          muted={false}
          controls={false}
          // preload="auto" tells the WebView to start fetching ahead so we
          // don't stall when playback catches up to the buffer head.
          preload="auto"
          // NOTE: crossOrigin removed — Fire OS WebView interprets SW-served
          // responses as opaque under that flag and drops video frames while
          // still decoding audio.
          style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000", filter: "none" }}
        >
          {tracks.map((t, i) => (
            <track
              key={t.url}
              kind="subtitles"
              src={t.url}
              srcLang={t.srclang || "en"}
              label={t.label || "Subtitles"}
              default={i === 0}
            />
          ))}
        </video>
      ) : resolved?.kind === "iframe" ? (
        <iframe
          className="player-canvas"
          src={resolved.url.replace("watch?v=", "embed/").replace("youtu.be/", "www.youtube.com/embed/") + "?autoplay=1"}
          allow="autoplay; encrypted-media"
          style={{ width: "100%", height: "100%", border: 0, background: "#000" }}
          title={movie.title}
        />
      ) : (
        <div className="player-canvas" style={{ background: art }}></div>
      )}
      {/* The scrims exist to keep the controls and the back button legible
          over bright video. Both of those are behind `showControls`, so when
          they hide the darkening has nothing left to do — fade it with them
          rather than leaving the top and bottom of the picture dimmed. */}
      <div className={`player-vignette ${showControls ? "" : "is-clear"}`}></div>

      {loading && (
        <div className="player-loading">
          <div className="ring"></div>
          <div style={{ fontSize: 18, color: "var(--text-dim)" }}>
            {movie.type === "stream"   ? "Buffering direct stream" :
             movie.type === "magnet"   ? "Magnet links need an external player" :
             movie.type === "yt"       ? "Loading YouTube" :
                                          "Streaming from Telegram"}…
          </div>
        </div>
      )}

      {/* Mid-playback rebuffer indicator — only visible while we're stalled,
          so it doesn't clutter the screen during normal playback. */}
      {!loading && buffering && resolved?.kind === "video" && (
        <div className="player-loading" style={{ pointerEvents: "none" }}>
          <div className="ring"></div>
          <div style={{ fontSize: 14, color: "var(--text-mute)" }}>Buffering…</div>
        </div>
      )}

      {!loading && resolved?.kind === "unsupported" && (
        <div className="player-loading">
          <div style={{ fontSize: 16, color: "var(--text-mute)", maxWidth: 540, textAlign: "center" }}>
            {resolved.reason}
          </div>
        </div>
      )}

      {!loading && resolved?.kind === "external" && (
        <div className="player-loading">
          <div style={{ fontSize: 16, color: "var(--text-mute)", maxWidth: 540, textAlign: "center" }}>
            This is a magnet link — open the External Picker (below) and hand it off to a torrent-capable player.
          </div>
        </div>
      )}

      {!loading && showSubs && tracks.length === 0 && subsNotice && (
        <div className="subtitle-overlay" style={{ bottom: 380 }}>
          <span className="line" style={{ opacity: 0.5, fontSize: 18 }}>
            No subtitles found
          </span>
        </div>
      )}

      {showControls && (
        <>
          <div data-focus-id="back" className={`player-back focusable ${focusedClass("back", fId)}`}>
            <Icon name="chevL" size={18} /> Back to {group.name}
          </div>

          <div className="player-controls">
            <h1 className="player-title">{movie.title}</h1>
            <div className="player-sub">
              <span>{movie.year}</span>
              <span>·</span>
              <span>{formatRuntime(movie.runtime)}</span>
              <span>·</span>
              <span>{movie.rating}</span>
              <span>·</span>
              <span>{movie.quality}</span>
              <span className="src-chip">
                <span
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 50,
                    background: group.palette,
                    display: "grid",
                    placeItems: "center",
                    color: "white",
                    fontSize: 9,
                    fontWeight: 700,
                  }}
                >
                  {group.avatar}
                </span>
                <span>{group.name}</span>
                <span style={{ color: "var(--text-mute)" }}>· shared by {sender}</span>
              </span>
            </div>

            <div className={`player-progress ${fId === "progress" ? "is-focused" : ""}`}>
              <span style={{ minWidth: 80 }}>{fmtClock(current)}</span>
              <div className="bar">
                <div className="fill" style={{ width: `${pct}%` }}></div>
              </div>
              <span style={{ minWidth: 80, textAlign: "right", color: "var(--text-dim)" }}>
                -{fmtClock(totalSec - current)}
              </span>
            </div>

            <div className="player-actions">
              <div data-focus-id="pa-back" className={`pa-btn focusable ${focusedClass("pa-back", fId)}`}>
                <Icon name="back10" size={28} />
              </div>
              <div data-focus-id="pa-play" className={`pa-btn play focusable ${focusedClass("pa-play", fId)}`}>
                <Icon name={playing ? "pause" : "play"} size={40} />
              </div>
              <div data-focus-id="pa-fwd" className={`pa-btn focusable ${focusedClass("pa-fwd", fId)}`}>
                <Icon name="fwd10" size={28} />
              </div>
              <div className="pa-flex"></div>
              <div data-focus-id="pa-mute" className={`pa-side focusable ${focusedClass("pa-mute", fId)}`}>
                {/* Inline svg — speaker / muted-speaker */}
                {muted ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <line x1="23" y1="9" x2="17" y2="15" />
                    <line x1="17" y1="9" x2="23" y2="15" />
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                  </svg>
                )}
                {muted ? "Muted" : "Sound on"}
              </div>
              <div data-focus-id="pa-subs" className={`pa-side focusable ${focusedClass("pa-subs", fId)}`}>
                <Icon name="cc" size={20} />
                {tracks.length === 0
                  ? "Subtitles · none"
                  : `Subtitles ${showSubs ? "· " + (tracks[0].label || "on") : "off"}`}
              </div>
              <div data-focus-id="pa-ext" className={`pa-side focusable ${focusedClass("pa-ext", fId)}`}>
                <Icon name="open" size={20} />
                Open with…
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
