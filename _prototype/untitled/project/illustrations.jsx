// Shared SVG illustrations + small helpers used across the prototype.

const Illustrations = {
  // Generic Israeli landscape — overlapping mountains in brand greens
  HeroLandscape({ height = 160 } = {}) {
    return (
      <svg viewBox="0 0 400 160" preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }}>
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#F4ECDC" />
            <stop offset="1" stopColor="#FAF7F0" />
          </linearGradient>
        </defs>
        <rect width="400" height="160" fill="url(#sky)" />
        <circle cx="320" cy="48" r="22" fill="#E8D4B0" opacity="0.85" />
        <path d="M0,128 L60,72 L110,108 L160,52 L220,114 L280,68 L340,100 L400,76 L400,160 L0,160 Z" fill="#90B090" opacity="0.6" />
        <path d="M0,140 L40,100 L100,128 L160,86 L210,120 L270,92 L330,124 L400,98 L400,160 L0,160 Z" fill="#A0C040" opacity="0.85" />
        <path d="M0,150 L70,124 L150,142 L240,128 L320,144 L400,130 L400,160 L0,160 Z" fill="#306030" />
        {/* hiker silhouette */}
        <g transform="translate(178 116)" fill="#1F4720">
          <circle cx="6" cy="2" r="3.2" />
          <path d="M2 6 L10 6 L13 16 L11 16 L8 11 L7 22 L4 22 L4 11 L2 16 L0 16 Z" />
          <path d="M11 9 L18 7 L18 8.5 L11 11 Z" />
        </g>
        {/* path swoosh */}
        <path d="M-5 152 Q120 120 200 138 T410 132" stroke="#FAF7F0" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.85" />
      </svg>
    );
  },

  // Mock photograph of Mearat HaMachpela — stylized illustration
  MachpelaImg() {
    return (
      <svg viewBox="0 0 400 250" preserveAspectRatio="xMidYMid slice" style={{ width: '100%', height: '100%', display: 'block' }}>
        <defs>
          <linearGradient id="msky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#E8D4B0" />
            <stop offset="1" stopColor="#F4ECDC" />
          </linearGradient>
          <linearGradient id="mwall" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#A08050" />
            <stop offset="1" stopColor="#6E5430" />
          </linearGradient>
        </defs>
        <rect width="400" height="250" fill="url(#msky)" />
        <circle cx="320" cy="60" r="38" fill="#fff" opacity="0.4" />
        {/* far hills */}
        <path d="M0 160 L80 120 L160 150 L240 110 L320 140 L400 120 L400 250 L0 250 Z" fill="#90B090" opacity="0.6" />
        {/* main building wall */}
        <rect x="60" y="90" width="280" height="160" fill="url(#mwall)" />
        {/* Herodian masonry rows */}
        {Array.from({ length: 7 }).map((_, i) => (
          <line key={i} x1="60" y1={106 + i * 18} x2="340" y2={106 + i * 18} stroke="#4A3F26" strokeWidth="0.5" opacity="0.5" />
        ))}
        {/* vertical block divisions */}
        {Array.from({ length: 6 }).map((_, i) => (
          <line key={i} x1={100 + i * 40} y1="90" x2={100 + i * 40} y2="250" stroke="#4A3F26" strokeWidth="0.4" opacity="0.4" />
        ))}
        {/* minarets / towers */}
        <rect x="92" y="50" width="22" height="50" fill="#8C6E40" />
        <polygon points="92,50 114,50 103,32" fill="#6E5430" />
        <rect x="286" y="50" width="22" height="50" fill="#8C6E40" />
        <polygon points="286,50 308,50 297,32" fill="#6E5430" />
        {/* domes */}
        <ellipse cx="170" cy="92" rx="22" ry="16" fill="#8C6E40" />
        <ellipse cx="230" cy="92" rx="22" ry="16" fill="#8C6E40" />
        {/* doorway */}
        <rect x="186" y="180" width="28" height="70" fill="#2A2620" rx="14 14 0 0" />
        {/* foreground stones / steps */}
        <rect x="0" y="240" width="400" height="10" fill="#4A3F26" />
        <rect x="0" y="232" width="400" height="8" fill="#6E5430" />
      </svg>
    );
  },

  // QR code mock
  QrMark({ size = 56 }) {
    const cells = [
      "1111111011110111111",
      "1000001010001000001",
      "1011101011010101110",
      "1011101001110101110",
      "1011101010001101110",
      "1000001011001000001",
      "1111111010101111111",
      "0000000011000000000",
      "1011110101101011010",
      "0010001100010110101",
      "1101110010111001110",
      "0011010110100110001",
      "1010111101011010110",
      "0000000011101011010",
      "1111111000110100100",
      "1000001001011010110",
      "1011101011001011010",
      "1011101001110100100",
      "1111111010101111111",
    ];
    const n = cells.length;
    const c = size / n;
    return (
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <rect width={size} height={size} fill="#fff" />
        {cells.map((row, y) =>
          row.split('').map((v, x) =>
            v === '1' ? <rect key={`${x}${y}`} x={x * c} y={y * c} width={c} height={c} fill="#2A2620" /> : null
          )
        )}
      </svg>
    );
  },

  Spark() {
    return (
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
        <path d="M18 4 L20 16 L32 18 L20 20 L18 32 L16 20 L4 18 L16 16 Z" fill="#A0C040" stroke="#306030" strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
    );
  },

  // Stylized topographic-ish map of the Judea region — coast on the right
  // (RTL: insetInlineStart 0 = west/sea), Dead Sea on the left (east).
  // City positions in % of viewport so we can layer pins via CSS.
  JudeaMap() {
    return (
      <svg viewBox="0 0 400 280" preserveAspectRatio="none"
        style={{ width: '100%', height: '100%', display: 'block' }}>
        <defs>
          <linearGradient id="jm-bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#F4ECDC" />
            <stop offset="1" stopColor="#E8D4B0" />
          </linearGradient>
          <pattern id="jm-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="#A08050" strokeWidth="0.6" opacity="0.25" />
          </pattern>
        </defs>
        {/* parchment ground */}
        <rect width="400" height="280" fill="url(#jm-bg)" />
        <rect width="400" height="280" fill="url(#jm-hatch)" />

        {/* Mediterranean sea — note: in our SVG, x=0 is LEFT edge of svg.
            But the wrapping div uses insetInlineStart so SVG x=0 corresponds to RTL right side.
            So we draw sea on the LEFT of the svg (which becomes the RIGHT/west visually in RTL). */}
        <path d="M0 0 L120 0 L100 80 L80 160 L70 220 L60 280 L0 280 Z" fill="#A8C8D8" opacity="0.85" />
        <text x="40" y="140" fontFamily="Heebo, sans-serif" fontSize="11" fill="#2A7C9C"
          textAnchor="middle" opacity="0.7">הים התיכון</text>
        {/* coastline highlight */}
        <path d="M120 0 L100 80 L80 160 L70 220 L60 280" stroke="#2A7C9C" strokeWidth="1.2" fill="none" opacity="0.5" />

        {/* Dead Sea — far east (right side of svg = RTL left/east) */}
        <path d="M340 90 L380 100 L380 200 L350 220 L335 180 L340 140 Z" fill="#9BB8C8" opacity="0.75" />
        <text x="358" y="160" fontFamily="Heebo, sans-serif" fontSize="9" fill="#2A7C9C" textAnchor="middle">ים</text>
        <text x="358" y="172" fontFamily="Heebo, sans-serif" fontSize="9" fill="#2A7C9C" textAnchor="middle">המלח</text>

        {/* Hills of Judea — soft contour blobs */}
        <path d="M150 60 Q200 40 260 70 T340 90 Q280 130 240 130 T160 100 Z" fill="#90B090" opacity="0.4" />
        <path d="M170 130 Q220 110 280 140 T335 180 Q280 200 240 195 T180 165 Z" fill="#A0C040" opacity="0.35" />
        <path d="M140 200 Q200 180 260 210 T335 220 Q280 250 240 245 T160 230 Z" fill="#90B090" opacity="0.4" />

        {/* Roads — light tan dashed */}
        <path d="M120 120 L200 110 L260 130 L300 150" stroke="#8C6E40" strokeWidth="1.4" fill="none" strokeDasharray="3 3" opacity="0.6" />
        <path d="M200 110 L210 80 L240 60" stroke="#8C6E40" strokeWidth="1.2" fill="none" strokeDasharray="3 3" opacity="0.5" />
        <path d="M260 130 L280 180 L300 220" stroke="#8C6E40" strokeWidth="1.2" fill="none" strokeDasharray="3 3" opacity="0.5" />

        {/* Cities — small dot + label. Positions tuned so חברון sits at ~56%, 48% of the visual map (which equals SVG x=400-56%=176, but RTL flips, so SVG x=224 ish for right=0% reading) */}
        {/* NOTE: the "%" coordinates passed via insetInlineStart on parent are RTL-flipped automatically by the browser, so we don't flip here — but the SVG itself doesn't have that, so its city labels are drawn directly in SVG coords. Internal SVG: x=0 is left/west = sea. */}

        {/* Jerusalem — northwest of map */}
        <g transform="translate(220 70)">
          <circle r="3.5" fill="#306030" />
          <text x="6" y="3" fontFamily="Heebo, sans-serif" fontSize="10" fill="#2A2620" fontWeight="600">ירושלים</text>
        </g>
        {/* Bethlehem */}
        <g transform="translate(225 100)">
          <circle r="2.5" fill="#306030" />
          <text x="6" y="3" fontFamily="Heebo, sans-serif" fontSize="9" fill="#2A2620">בית לחם</text>
        </g>
        {/* Hebron */}
        <g transform="translate(220 145)">
          <circle r="3.5" fill="#306030" />
          <text x="6" y="3" fontFamily="Heebo, sans-serif" fontSize="10" fill="#2A2620" fontWeight="600">חברון</text>
        </g>
        {/* Beer Sheva */}
        <g transform="translate(180 230)">
          <circle r="2.5" fill="#306030" />
          <text x="6" y="3" fontFamily="Heebo, sans-serif" fontSize="9" fill="#2A2620">באר שבע</text>
        </g>
        {/* Jericho */}
        <g transform="translate(310 75)">
          <circle r="2.5" fill="#306030" />
          <text x="-6" y="3" textAnchor="end" fontFamily="Heebo, sans-serif" fontSize="9" fill="#2A2620">יריחו</text>
        </g>
        {/* Ein Gedi */}
        <g transform="translate(330 145)">
          <circle r="2" fill="#306030" />
          <text x="-6" y="3" textAnchor="end" fontFamily="Heebo, sans-serif" fontSize="8" fill="#2A2620">עין גדי</text>
        </g>

        {/* Compass rose */}
        <g transform="translate(360 30)">
          <circle r="14" fill="#FAF7F0" stroke="#6E5430" strokeWidth="0.8" opacity="0.9" />
          <path d="M0 -10 L2 0 L0 10 L-2 0 Z" fill="#6E5430" />
          <path d="M-10 0 L0 -2 L10 0 L0 2 Z" fill="#A08050" opacity="0.6" />
          <text y="-15" textAnchor="middle" fontFamily="Heebo, sans-serif" fontSize="7" fill="#6E5430">צ</text>
        </g>

        {/* Title */}
        <text x="200" y="20" textAnchor="middle" fontFamily="BA Hamossad, serif" fontSize="14" fill="#6E5430">
          הר חברון ויהודה
        </text>
      </svg>
    );
  },
};

window.Illustrations = Illustrations;
