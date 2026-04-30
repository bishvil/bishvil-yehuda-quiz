// TrailCard.jsx - the workhorse card for tour/trail listings
const TrailCard = ({ trail, onSelect }) => {
  const grad = trail.gradient || ['#B4DC64', '#8CC83C', '#C8A078'];
  return (
    <article className="bsy-card" onClick={() => onSelect && onSelect(trail)}>
      <div className="bsy-card-thumb">
        <svg viewBox="0 0 300 140" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <rect width="300" height="140" fill="#FBF7EE"/>
          <path d="M0 90 L70 60 L140 85 L210 55 L300 75 L300 140 L0 140 Z" fill={grad[1]} opacity="0.7"/>
          <path d="M0 110 L60 85 L130 105 L210 80 L300 100 L300 140 L0 140 Z" fill={grad[2]} opacity="0.85"/>
          <path d="M0 130 L80 110 L160 125 L240 105 L300 120 L300 140 L0 140 Z" fill={grad[0]}/>
          <path d="M-5 134 Q 100 122, 200 132 T 305 128" stroke="#FBF7EE" strokeWidth="3" fill="none"/>
        </svg>
        {trail.badge && <span className="bsy-card-badge">{trail.badge}</span>}
      </div>
      <div className="bsy-card-body">
        <div className="bsy-eyebrow">{trail.region}</div>
        <h3 className="bsy-card-title">{trail.title}</h3>
        <div className="bsy-card-meta">
          <span>{trail.duration}</span>
          <span>{trail.difficulty}</span>
          <span>{trail.date}</span>
        </div>
      </div>
    </article>
  );
};

window.TrailCard = TrailCard;
