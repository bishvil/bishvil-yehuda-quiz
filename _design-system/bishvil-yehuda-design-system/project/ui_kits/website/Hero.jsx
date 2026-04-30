// Hero.jsx - top of homepage: full-bleed landscape feel + headline + CTA
const Hero = () => (
  <section className="bsy-hero">
    <div className="bsy-hero-bg">
      {/* Stylized landscape using brand mountain motif from logos */}
      <svg viewBox="0 0 400 260" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FBF7EE"/>
            <stop offset="100%" stopColor="#F4ECDC"/>
          </linearGradient>
        </defs>
        <rect width="400" height="260" fill="url(#sky)"/>
        {/* far ridge - sage */}
        <path d="M0 170 L70 130 L140 160 L210 120 L290 150 L360 130 L400 145 L400 260 L0 260 Z" fill="#8CB48C" opacity="0.85"/>
        {/* mid ridge - tan */}
        <path d="M0 200 L60 170 L120 195 L200 165 L280 190 L340 175 L400 185 L400 260 L0 260 Z" fill="#C8A078" opacity="0.9"/>
        {/* near ridge - bright green */}
        <path d="M0 230 L80 200 L160 225 L240 195 L320 220 L400 210 L400 260 L0 260 Z" fill="#8CC83C"/>
        {/* white walking-path swoosh */}
        <path d="M-10 248 Q 100 232, 200 244 T 410 240" stroke="#FBF7EE" strokeWidth="6" fill="none" strokeLinecap="round"/>
      </svg>
    </div>
    <div className="bsy-hero-body">
      <div className="bsy-eyebrow">סיורי מורשת · יהודה ושומרון</div>
      <h1 className="bsy-hero-title">כל אבן כאן<br/>מספרת סיפור</h1>
      <p className="bsy-hero-sub">בואו לצעוד אִתנו במסלולי המורשת של ארץ ישראל — מהר חברון, דרך גוש עציון, עד גבעות הגליל.</p>
      <div className="bsy-hero-cta">
        <button className="bsy-btn bsy-btn-primary">הצטרפו לסיור הקרוב</button>
        <button className="bsy-btn bsy-btn-tertiary">לכל המסלולים <span className="arrow">←</span></button>
      </div>
    </div>
  </section>
);

window.Hero = Hero;
