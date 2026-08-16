import { useLayoutEffect, useState } from "react";
import { Icon } from "./Icon.jsx";
import { focusedClass } from "./focus.js";
import { TYPE_META, formatRuntime } from "./data.js";
import { useArt } from "./useArt.js";

export function TVStage({ children }) {
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const fit = () => {
      // Hold the scale while a text field has focus. The manifest asks for
      // windowSoftInputMode="adjustNothing", but from API 35 the platform
      // delivers IME insets to the WebView anyway, so innerHeight drops by the
      // keyboard's height and the whole 1920x1080 canvas would visibly shrink
      // mid-typing. When the IME closes the viewport grows back and fires
      // another resize, by which point nothing is focused and this recomputes.
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      setScale(Math.min(window.innerWidth / 1920, window.innerHeight / 1080));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  // Sizer holds the *scaled* footprint; the stage scales from its top-left.
  // Without the sizer, the stage's pre-scale 1920×1080 layout box overflows
  // a smaller viewport and the visual content ends up offset.
  return (
    <div className="tv-stage-root">
      <div className="tv-stage-sizer" style={{ width: 1920 * scale, height: 1080 * scale }}>
        <div className="tv-stage" style={{ transform: `scale(${scale})`, transformOrigin: "0 0" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

export function Chrome({ context, time }) {
  return (
    <div className="tv-chrome">
      <div className="brand">
        <div className="brand-mark">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M21 4L2 11l6 2 2 7 3-4 6 4 2-16z" fill="white" />
          </svg>
        </div>
        <div className="brand-name">
          Telecast<span> · {context}</span>
        </div>
      </div>
      <div className="status">
        <span><Icon name="wifi" size={18} /></span>
        <span>{time}</span>
        <span className="dot"></span>
        <span>Connected</span>
      </div>
    </div>
  );
}

export function HintBar({ hints }) {
  return (
    <div className="tv-hints">
      {hints.map((h, i) => (
        <div key={i} className="hint">
          <span className="key">{h.key}</span>
          <span>{h.label}</span>
        </div>
      ))}
    </div>
  );
}

// Shown on a favourited movie card. Purely an indicator — toggling is a long
// press on the card itself, since a TV remote has no second button to spare.
function FavStar() {
  return (
    <div className="fav-star" title="Favourite">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        <polygon points="12 2 15 8.5 22 9.3 17 14.3 18.2 21.3 12 17.8 5.8 21.3 7 14.3 2 9.3 9 8.5 12 2" />
      </svg>
    </div>
  );
}

export function Poster({ movie, focused, source, badge, showProgress = false, width, focusId, isFavorite = false }) {
  const isComplete = movie.progress >= 1;
  const showProg = showProgress && movie.progress > 0 && movie.progress < 1;
  const style = width ? { width } : undefined;
  const art = useArt(movie, "tall");
  return (
    <div data-focus-id={focusId} className={`poster focusable ${focused ? "is-focused" : ""}`} style={style}>
      <div className="poster-art" style={{ background: art }}></div>
      <div className="poster-grad"></div>
      {badge && <div className={`poster-badge ${badge.tone || ""}`}>{badge.text}</div>}
      {!badge && movie.quality && <div className="poster-badge">{movie.quality}</div>}
      {isFavorite && <FavStar />}
      {source && (
        <div className="poster-source" style={{ background: source.color }} title={source.name}>
          {source.initials}
        </div>
      )}
      <div className="poster-body">
        <div className="poster-title" style={{ textWrap: "pretty" }}>{movie.title}</div>
        <div className="poster-meta">
          <span>{movie.year}</span>
          <span>·</span>
          <span>{formatRuntime(movie.runtime)}</span>
          {isComplete && (
            <>
              <span>·</span>
              <span style={{ color: "var(--good)" }}>Watched</span>
            </>
          )}
        </div>
      </div>
      {showProg && (
        <div className="poster-progress">
          <div style={{ width: `${movie.progress * 100}%` }} />
        </div>
      )}
    </div>
  );
}

export function ChatCard({ group, focused, focusId, isFavorite = false, onToggleFav }) {
  const onStarClick = (e) => {
    // Stop the screen-level delegated click handler from also entering the
    // group when we just want to toggle the star.
    e.stopPropagation();
    onToggleFav?.();
  };
  return (
    <div data-focus-id={focusId} className={`chat-card focusable ${focused ? "is-focused" : ""}`}>
      <div className="chat-avatar" style={{ background: group.palette }}>{group.avatar}</div>
      <div className="chat-body">
        <div className="chat-name">{group.name}</div>
        <div className="chat-meta">{group.lastMessage}</div>
        <div className="chat-counts">
          <span className="chat-pill">
            <span className="num">{group.movies.length}</span>&nbsp;movies
          </span>
          {group.unread > 0 ? (
            <span className="chat-pill chat-unread">{group.unread} new</span>
          ) : group.members > 0 ? (
            <span className="chat-pill">{group.members.toLocaleString()} members</span>
          ) : (
            // One-to-one chats have no participant count — "0 members" reads
            // like a broken group, so show what the chat actually is.
            <span className="chat-pill">{group.kind || "Chat"}</span>
          )}
        </div>
      </div>
      {onToggleFav && (
        <div
          className={`chat-star ${isFavorite ? "on" : ""}`}
          onClick={onStarClick}
          title={isFavorite ? "Unfavorite" : "Favorite"}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill={isFavorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
            <polygon points="12 2 15 8.5 22 9.3 17 14.3 18.2 21.3 12 17.8 5.8 21.3 7 14.3 2 9.3 9 8.5 12 2" />
          </svg>
        </div>
      )}
    </div>
  );
}

export function MediaCard({ entry, focused, focusId, isFavorite = false }) {
  const { movie, sender, sentAgo } = entry;
  const tMeta = TYPE_META[movie.type];
  const iconMap = { file: "file", stream: "link", magnet: "magnet", yt: "youtube" };
  const art = useArt(movie);
  return (
    <div data-focus-id={focusId} className={`media-card focusable ${focused ? "is-focused" : ""}`}>
      <div className="mc-art" style={{ background: art }}></div>
      <div className="mc-grad"></div>
      <div className={`mc-badge ${movie.type}`}>
        <Icon name={iconMap[movie.type]} size={12} />
        {tMeta.short}
      </div>
      <div className="mc-duration">{formatRuntime(movie.runtime)}</div>
      {isFavorite && <FavStar />}
      <div className="mc-body">
        <div className="mc-title">
          {movie.title} <span style={{ color: "var(--text-mute)", fontWeight: 400 }}>· {movie.year}</span>
        </div>
        <div className="mc-meta">
          <span>{sender}</span>
          <span>·</span>
          <span>{sentAgo}</span>
          <span>·</span>
          <span>{movie.quality}</span>
          {movie.size && (
            <>
              <span>·</span>
              <span>{movie.size}</span>
            </>
          )}
        </div>
      </div>
      {movie.progress > 0 && movie.progress < 1 && (
        <div className="mc-progress">
          <div style={{ width: `${movie.progress * 100}%` }} />
        </div>
      )}
    </div>
  );
}

export function Keypad({ focusedId, onPress }) {
  // Wrap every key in a button so it works with mouse/touch in addition to
  // the focus-grid Enter handler. Pressing in any modality calls onPress(id).
  const Key = ({ id, alt, style, children }) => (
    <div
      role="button"
      tabIndex={-1}
      data-focus-id={id}
      className={`key-btn ${alt ? "alt" : ""} focusable ${focusedClass(id, focusedId)}`}
      style={style}
      onClick={() => onPress?.(id)}
    >
      {children}
    </div>
  );
  return (
    <div className="keypad">
      <Key id="k1">1</Key>
      <Key id="k2">2</Key>
      <Key id="k3">3</Key>
      <Key id="k4">4</Key>
      <Key id="k5">5</Key>
      <Key id="k6">6</Key>
      <Key id="k7">7</Key>
      <Key id="k8">8</Key>
      <Key id="k9">9</Key>
      <Key id="kbk" alt><Icon name="bksp" size={26} /></Key>
      <Key id="k0">0</Key>
      <Key
        id="kok"
        alt
        style={{
          background: focusedId === "kok" ? "var(--accent)" : "rgba(46,166,255,0.18)",
          borderColor: focusedId === "kok" ? "var(--accent)" : "rgba(46,166,255,0.4)",
          color: focusedId === "kok" ? "#0a1530" : "#5fc1ff",
        }}
      >
        <Icon name="check" size={26} />
      </Key>
    </div>
  );
}

export function ExternalPicker({ focusedId, players, onSelect, error = "", progress = null }) {
  return (
    <div className="modal-backdrop">
      <div className="modal screen">
        <h2 className="modal-title">Open with…</h2>
        <p className="modal-sub">Pick an installed player. Telecast will hand off the stream URL.</p>
        {error && (
          <p className="modal-sub" style={{ color: "var(--bad)", marginTop: -20 }}>{error}</p>
        )}
        {progress && (
          <div className="export-progress">
            <div className="ep-label">{progress.label}</div>
            <div className="ep-track"><div className="ep-fill" style={{ width: `${progress.pct}%` }} /></div>
          </div>
        )}
        <div className="player-options">
          {players.map((p) => (
            <div
              key={p.id}
              data-focus-id={p.id}
              className={`player-option focusable ${p.available === false ? "is-unavailable" : ""} ${focusedClass(p.id, focusedId)}`}
              onClick={() => p.available !== false && onSelect?.(p.id)}
            >
              <div className="po-icon" style={{ background: p.color }}>{p.glyph}</div>
              <div>
                <div className="po-name">{p.name}</div>
                <div className="po-meta">{p.meta}</div>
              </div>
              <div className="po-tag">{p.tag}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
