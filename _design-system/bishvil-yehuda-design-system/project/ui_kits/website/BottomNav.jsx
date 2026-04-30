// BottomNav.jsx - mobile bottom tab bar
const BottomNav = ({ active, onNavigate }) => {
  const items = [
    { id: 'home',    label: 'בית',     icon: 'M3 9.5 12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z' },
    { id: 'trails',  label: 'מסלולים', icon: 'm8 3 4 8 5-5 5 15H2L8 3z' },
    { id: 'stories', label: 'סיפורים', icon: 'M4 4h16v14H7l-3 3z' },
    { id: 'me',      label: 'שלי',     icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 9a8 8 0 0 1 16 0' },
  ];
  return (
    <nav className="bsy-bottomnav">
      {items.map(item => (
        <button
          key={item.id}
          className={`bsy-bottomnav-item ${active === item.id ? 'active' : ''}`}
          onClick={() => onNavigate(item.id)}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={item.icon}/></svg>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
};

window.BottomNav = BottomNav;
