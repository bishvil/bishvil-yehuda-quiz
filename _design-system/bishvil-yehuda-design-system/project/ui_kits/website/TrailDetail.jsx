// TrailDetail.jsx - the detail screen for a single trail
const TrailDetail = ({ trail, onBack }) => {
  const grad = trail.gradient || ['#B4DC64', '#8CC83C', '#C8A078'];
  const stations = trail.stations || [
    { n: '01', title: 'מערת המכפלה', note: 'נקודת הזינוק. שיחה קצרה על תקופת האבות.' },
    { n: '02', title: 'גבעת ארבע',   note: 'תצפית פתוחה על הר חברון ועמק בית-כרם.' },
    { n: '03', title: 'אלוני ממרא',  note: 'ביקור באתר אבות הארכיאולוגיה.' },
    { n: '04', title: 'באר שבע',     note: 'סיכום ופרידה.' },
  ];
  return (
    <div className="bsy-detail">
      <div className="bsy-detail-hero">
        <button className="bsy-back" onClick={onBack} aria-label="חזרה">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6"/></svg>
        </button>
        <svg viewBox="0 0 400 220" preserveAspectRatio="xMidYMid slice" aria-hidden="true" className="bsy-detail-bg">
          <rect width="400" height="220" fill="#F4ECDC"/>
          <path d="M0 130 L70 90 L140 120 L210 80 L290 110 L360 90 L400 105 L400 220 L0 220 Z" fill="#8CB48C" opacity="0.85"/>
          <path d="M0 160 L60 130 L120 155 L200 125 L280 150 L340 135 L400 145 L400 220 L0 220 Z" fill={grad[2]} opacity="0.9"/>
          <path d="M0 190 L80 160 L160 185 L240 155 L320 180 L400 170 L400 220 L0 220 Z" fill={grad[1]}/>
          <path d="M-10 208 Q 100 192, 200 204 T 410 200" stroke="#FBF7EE" strokeWidth="5" fill="none" strokeLinecap="round"/>
        </svg>
        <div className="bsy-detail-hero-body">
          <div className="bsy-eyebrow" style={{color: '#FBF7EE'}}>{trail.region}</div>
          <h1 className="bsy-detail-title">{trail.title}</h1>
        </div>
      </div>
      <div className="bsy-detail-meta">
        <div><div className="k">משך</div><div className="v">{trail.duration}</div></div>
        <div><div className="k">קושי</div><div className="v">{trail.difficulty}</div></div>
        <div><div className="k">מדריך</div><div className="v">הרב יואב</div></div>
      </div>
      <div className="bsy-detail-body">
        <p className="bsy-lead">{trail.lead || 'סיור מורשת בן יום שלם, צופה את ההיסטוריה היהודית באזור דרומה של ארץ יהודה. נצא יחד מנקודה היסטורית, נצעד בשבילי האבות, ונסיים בסיפור על המקום.'}</p>
        <h3 className="bsy-section-title">תחנות במסלול</h3>
        <ol className="bsy-stations">
          {stations.map(s => (
            <li key={s.n}>
              <span className="bsy-station-n">{s.n}</span>
              <div>
                <div className="bsy-station-t">{s.title}</div>
                <div className="bsy-station-note">{s.note}</div>
              </div>
            </li>
          ))}
        </ol>
        <button className="bsy-btn bsy-btn-primary bsy-btn-block">הצטרפו לסיור · 18 בנובמבר</button>
        <p className="bsy-fine">מקומות מוגבלים. ביטול עד 48 שעות לפני המועד.</p>
      </div>
    </div>
  );
};

window.TrailDetail = TrailDetail;
