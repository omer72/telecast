export function Icon({ name, size = 24, stroke = "currentColor", fill = "none" }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill,
    stroke,
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };
  const paths = {
    home: <path d="M3 11l9-8 9 8v9a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2z" />,
    chat: <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.5 8.5 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z" />,
    movies: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4M3 12h18" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
      </>
    ),
    play: <polygon points="6 4 20 12 6 20 6 4" fill="currentColor" stroke="none" />,
    pause: (
      <>
        <rect x="6" y="4" width="4" height="16" fill="currentColor" stroke="none" />
        <rect x="14" y="4" width="4" height="16" fill="currentColor" stroke="none" />
      </>
    ),
    back10: (
      <>
        <path d="M3 12a9 9 0 1 0 3-6.7" />
        <path d="M3 3v6h6" />
        <text x="12" y="15" textAnchor="middle" fontSize="7" fontFamily="ui-monospace" fontWeight="700" fill="currentColor" stroke="none">10</text>
      </>
    ),
    fwd10: (
      <>
        <path d="M21 12a9 9 0 1 1-3-6.7" />
        <path d="M21 3v6h-6" />
        <text x="12" y="15" textAnchor="middle" fontSize="7" fontFamily="ui-monospace" fontWeight="700" fill="currentColor" stroke="none">10</text>
      </>
    ),
    chevR: <polyline points="9 6 15 12 9 18" />,
    chevL: <polyline points="15 6 9 12 15 18" />,
    chevD: <polyline points="6 9 12 15 18 9" />,
    chevU: <polyline points="6 15 12 9 18 15" />,
    cc: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M7 14a2 2 0 1 1 2-3M13 14a2 2 0 1 1 2-3" />
      </>
    ),
    open: (
      <>
        <path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4" />
        <polyline points="14 3 21 3 21 10" />
        <line x1="10" y1="14" x2="21" y2="3" />
      </>
    ),
    bookmark: <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />,
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <line x1="12" y1="8" x2="12" y2="8" />
        <line x1="12" y1="12" x2="12" y2="16" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <line x1="21" y1="21" x2="16.5" y2="16.5" />
      </>
    ),
    download: (
      <>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </>
    ),
    file: (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </>
    ),
    link: (
      <>
        <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 1 0-7-7l-1.7 1.7" />
        <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
      </>
    ),
    magnet: (
      <>
        <path d="M18 2v8a6 6 0 1 1-12 0V2" />
        <line x1="2" y1="2" x2="10" y2="2" />
        <line x1="14" y1="2" x2="22" y2="2" />
      </>
    ),
    youtube: (
      <>
        <rect x="2" y="5" width="20" height="14" rx="3" />
        <polygon points="10 9 16 12 10 15" fill="currentColor" stroke="none" />
      </>
    ),
    bksp: (
      <>
        <path d="M21 4H8L2 12l6 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
        <line x1="18" y1="9" x2="12" y2="15" />
        <line x1="12" y1="9" x2="18" y2="15" />
      </>
    ),
    check: <polyline points="20 6 9 17 4 12" />,
    wifi: (
      <>
        <path d="M5 12a10 10 0 0 1 14 0" />
        <path d="M8.5 15.5a5 5 0 0 1 7 0" />
        <circle cx="12" cy="19" r="0.5" fill="currentColor" />
      </>
    ),
    logout: (
      <>
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </>
    ),
    folder: <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />,
  };
  return <svg className="svg-i" {...common}>{paths[name] || null}</svg>;
}
