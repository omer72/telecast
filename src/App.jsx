import { useEffect, useMemo, useRef, useState } from "react";
import { Chrome, ExternalPicker, HintBar, TVStage } from "./components.jsx";
import { useFocusGrid } from "./focus.js";
import { GroupDetail, Library, PasswordEntry, PhoneEntry, PinEntry, Player } from "./screens.jsx";
import { checkPassword, exportFileToCache, initStreaming, isAuthenticated, logout, resendCode, sendCode, signIn } from "./api.js";
import { PACKAGES, exitApp, isInstalled, openExternal, openFile } from "./intent.js";

// `pkg` is what we ask the package manager about — entries without one are
// always available. Tags are filled in at runtime; nothing here claims an app
// is installed until Android says so.
const EXTERNAL_PLAYERS = [
  { id: "ext-internal", name: "Telecast Player", meta: "Built in · Resume · Subtitles",        glyph: "T",   color: "linear-gradient(135deg,#2ea6ff,#5fc1ff)", tag: "Default" },
  { id: "ext-vlc",      name: "VLC for Android", meta: "Best for .mkv · 4K HDR · Any codec",    glyph: "VL",  color: "linear-gradient(135deg,#f97316,#ea580c)", pkg: PACKAGES.vlc },
  { id: "ext-mx",       name: "MX Player",       meta: "Hardware acceleration · Subtitle styling", glyph: "MX", color: "linear-gradient(135deg,#3b82f6,#1d4ed8)", pkg: PACKAGES.mx },
  { id: "ext-system",   name: "System Default",  meta: "Android TV media player",                glyph: "Sys", color: "linear-gradient(135deg,#475569,#64748b)", tag: "Available" },
];

const fmtBytes = (n) => {
  const gb = n / 1024 ** 3;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.round(n / 1024 ** 2)} MB`;
};

export default function App() {
  const [screen, setScreen] = useState("phone");
  const [phone, setPhone] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [tab, setTab] = useState("home");
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [playerCtx, setPlayerCtx] = useState(null);
  const [showExternal, setShowExternal] = useState(false);
  // Resolved URL of the currently playing media — Player publishes this so
  // the external-picker callback can hand it off.
  const [playableUrl, setPlayableUrl] = useState(null);
  const [extError, setExtError] = useState("");
  // Non-null while a Telegram file is being written to disk for hand-off.
  const [exportProgress, setExportProgress] = useState(null);
  const cancelExport = useRef(false);
  // Player chrome visibility, mirrored up so the hint bar can hide with it.
  const [playerControls, setPlayerControls] = useState(true);
  // Description of how Telegram is delivering the code (App / SMS / Call) +
  // resend timeout — surfaced to the user on the PIN screen.
  const [deliveryInfo, setDeliveryInfo] = useState(null);

  // Restore session on boot — skip the login flow if we already have a valid one.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Register the streaming SW once per boot — must be controlling the
      // page before resolveMediaUrl hands out /tg-stream URLs.
      await initStreaming();
      try {
        if (await isAuthenticated()) {
          if (!cancelled) setScreen("library");
        }
      } catch {
        /* fall through to phone entry */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Double-BACK on the library offers to quit. A single press must never exit
  // (that was the old Android default, and it killed the app mid-browse), but
  // the remote still needs a way out that isn't buried in Settings.
  useEffect(() => {
    if (screen !== "library" || showExternal) return;
    let last = 0;
    const onKey = (e) => {
      if (e.key !== "Escape" && e.key !== "Backspace") return;
      // First press in a text field only blurs it — don't count that one.
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable) return;
      const t = e.timeStamp;
      if (t - last < 2000) {
        last = 0;
        if (confirm("Exit Telecast?")) exitApp();
      } else {
        last = t;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen, showExternal]);

  // Live clock
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30 * 1000);
    return () => clearInterval(t);
  }, []);
  const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  // Ask Android which players are actually here, once per boot.
  const [installedPkgs, setInstalledPkgs] = useState({});
  useEffect(() => {
    (async () => {
      const entries = await Promise.all(
        EXTERNAL_PLAYERS.filter((p) => p.pkg).map(async (p) => [p.pkg, await isInstalled(p.pkg)])
      );
      setInstalledPkgs(Object.fromEntries(entries));
    })();
  }, []);

  const players = useMemo(
    () =>
      EXTERNAL_PLAYERS.map((p) =>
        p.pkg
          ? { ...p, available: !!installedPkgs[p.pkg], tag: installedPkgs[p.pkg] ? "Installed" : "Not installed" }
          : { ...p, available: true }
      ),
    [installedPkgs]
  );

  // External picker focus — skip players that aren't on the device so the
  // D-pad doesn't stop on a row that can't do anything.
  const extRows = useMemo(() => players.filter((p) => p.available).map((p) => [p.id]), [players]);
  const handleExtEnter = async (id) => {
    setExtError("");
    if (id === "ext-internal") { setShowExternal(false); return; }
    const pkg = id === "ext-vlc" ? PACKAGES.vlc
              : id === "ext-mx"  ? PACKAGES.mx
              : null; // ext-system → no package, show chooser

    // A /tg-stream/ URL is served by our own service worker and means nothing
    // outside this WebView, so a Telegram-hosted file has to become a real
    // file on disk first. Everything else (direct streams, magnets, YouTube)
    // is already a URL any player can open.
    const needsExport = !playableUrl || playableUrl.startsWith("/tg-stream/");
    if (needsExport && !playerCtx?.movie?._doc) {
      setExtError("Nothing playable to hand off yet.");
      return;
    }

    try {
      if (needsExport) {
        cancelExport.current = false;
        setExportProgress({ pct: 0, label: "Preparing download…" });
        const path = await exportFileToCache(
          playerCtx.movie,
          (got, total) => {
            const pct = total ? Math.floor((got / total) * 100) : 0;
            setExportProgress({
              pct,
              label: `Downloading for ${pkg ? "the player" : "hand-off"}… ${pct}% (${fmtBytes(got)} of ${fmtBytes(total)}) · BACK to cancel`,
            });
          },
          () => cancelExport.current
        );
        setExportProgress(null);
        await openFile({ path, pkg, mime: "video/*" });
      } else {
        await openExternal({ url: playableUrl, pkg });
      }
      setShowExternal(false);
    } catch (err) {
      setExportProgress(null);
      const msg = String(err?.message || err);
      setExtError(msg === "cancelled" ? "Download cancelled." : msg);
    }
  };
  const { focusedId: extFocused } = useFocusGrid(
    showExternal ? extRows : [["__noop"]],
    {
      onEnter: handleExtEnter,
      // Mid-download, BACK cancels the download rather than closing the picker.
      onBack: () => {
        if (exportProgress) { cancelExport.current = true; return; }
        setShowExternal(false);
      },
      enabled: showExternal,
      initial: "ext-internal",
    }
  );

  const ctxLabel =
    screen === "phone"    ? "Sign in" :
    screen === "pin"      ? "Verify code" :
    screen === "password" ? "Cloud password" :
    screen === "library"  ? (tab === "chats" ? "Chats" : tab === "settings" ? "Settings" : "Home") :
    screen === "group"    ? selectedGroup?.name :
    screen === "player"   ? (showExternal ? "Open with…" : "Now playing") :
    "Telecast";

  const hintsByScreen = {
    phone:    [{ key: "↑↓←→", label: "Move" }, { key: "OK", label: "Press" }, { key: "⌫", label: "Delete" }],
    pin:      [{ key: "↑↓←→", label: "Move" }, { key: "OK", label: "Press" }, { key: "BACK", label: "Change number" }],
    password: [{ key: "type", label: "Password" }, { key: "OK", label: "Continue" }, { key: "BACK", label: "Code" }],
    library:  [{ key: "↑↓←→", label: "Navigate" }, { key: "OK", label: "Open" }, { key: "BACK", label: "Menu · twice to exit" }],
    group:    [{ key: "↑↓←→", label: "Navigate" }, { key: "OK", label: "Play" }, { key: "BACK", label: "Chats" }],
    player:   [{ key: "↑↓←→", label: showExternal ? "Pick" : "Seek · Controls" }, { key: "OK", label: showExternal ? "Open" : "Play / Pause" }, { key: "BACK", label: showExternal ? "Cancel" : "Exit" }],
  };

  // -------- auth handlers --------
  const handlePhoneSubmit = async (p) => {
    setPhone(p);
    setAuthError("");
    setAuthBusy(true);
    try {
      const res = await sendCode("+" + p);
      if (res.ok) {
        setDeliveryInfo({ current: res.current, next: res.next, timeout: res.timeout });
        setScreen("pin");
      } else {
        setAuthError(res.error || "Could not send code");
      }
    } catch (err) {
      setAuthError(err?.errorMessage || String(err));
    } finally {
      setAuthBusy(false);
    }
  };

  const handleResend = async () => {
    const res = await resendCode();
    if (res?.ok) setDeliveryInfo({ current: res.current, next: res.next, timeout: res.timeout });
    return res;
  };

  const handlePinSubmit = async (code) => {
    setAuthError("");
    setAuthBusy(true);
    try {
      const res = await signIn(code);
      if (res.ok) {
        setScreen("library");
      } else if (res.needsPassword) {
        setScreen("password");
      } else {
        setAuthError(res.error || "Sign-in failed");
      }
    } catch (err) {
      setAuthError(err?.errorMessage || String(err));
    } finally {
      setAuthBusy(false);
    }
  };

  const handlePasswordSubmit = async (pw) => {
    setAuthError("");
    setAuthBusy(true);
    try {
      const res = await checkPassword(pw);
      if (res.ok) setScreen("library");
      else setAuthError(res.error || "Wrong password");
    } catch (err) {
      setAuthError(err?.errorMessage || String(err));
    } finally {
      setAuthBusy(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setScreen("phone");
    setPhone("");
  };

  return (
    <TVStage>
      {screen !== "player" && <Chrome context={ctxLabel} time={timeStr} />}

      {screen === "phone" && (
        <PhoneEntry onSubmit={handlePhoneSubmit} busy={authBusy} error={authError} />
      )}

      {screen === "pin" && (
        <PinEntry
          phone={phone}
          onSubmit={handlePinSubmit}
          onBack={() => setScreen("phone")}
          onResend={handleResend}
          delivery={deliveryInfo}
          busy={authBusy}
          remoteError={authError}
        />
      )}

      {screen === "password" && (
        <PasswordEntry
          phone={phone}
          onSubmit={handlePasswordSubmit}
          onBack={() => setScreen("pin")}
          busy={authBusy}
          remoteError={authError}
        />
      )}

      {screen === "library" && (
        <Library
          tab={tab}
          setTab={setTab}
          onSelectGroup={(g) => { setSelectedGroup(g); setScreen("group"); }}
          onOpenPlayer={(mv, ctx) => { setPlayerCtx({ movie: mv, ...ctx }); setScreen("player"); }}
          onLogout={handleLogout}
        />
      )}

      {screen === "group" && selectedGroup && (
        <GroupDetail
          group={selectedGroup}
          onBack={() => setScreen("library")}
          onOpenMovie={(entry) => {
            setPlayerCtx({
              movie: entry.movie,
              group: selectedGroup,
              sender: entry.sender,
              resume: entry.movie.progress > 0,
            });
            setScreen("player");
          }}
        />
      )}

      {screen === "player" && playerCtx && (
        <Player
          context={playerCtx}
          onBack={() => { setScreen(selectedGroup ? "group" : "library"); setPlayableUrl(null); }}
          onOpenExternal={() => setShowExternal(true)}
          onResolvedUrl={setPlayableUrl}
          onControlsChange={setPlayerControls}
        />
      )}

      {showExternal && (
        <ExternalPicker focusedId={extFocused} players={players} onSelect={handleExtEnter} error={extError} progress={exportProgress} />
      )}

      {(screen !== "player" || playerControls || showExternal) && (
        <HintBar hints={hintsByScreen[screen] || []} />
      )}
    </TVStage>
  );
}
