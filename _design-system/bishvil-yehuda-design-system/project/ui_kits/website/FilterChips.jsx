// FilterChips.jsx - horizontal scrolling region filter
const FilterChips = ({ filters, active, onChange }) => (
  <div className="bsy-chips">
    {filters.map(f => (
      <button
        key={f}
        className={`bsy-chip ${active === f ? 'active' : ''}`}
        onClick={() => onChange(f)}
      >{f}</button>
    ))}
  </div>
);

window.FilterChips = FilterChips;
