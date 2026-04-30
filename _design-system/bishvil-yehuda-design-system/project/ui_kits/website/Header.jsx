// Header.jsx - sticky top bar with logo, menu trigger, search
const Header = ({ onMenu }) => (
  <header className="bsy-header">
    <button className="bsy-icon-btn" onClick={onMenu} aria-label="תפריט">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
    </button>
    <div className="bsy-header-mark">
      <img src="../../assets/logos/logo_yehuda.png" alt="בשביל יהודה" />
    </div>
    <button className="bsy-icon-btn" aria-label="חיפוש">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
    </button>
  </header>
);

window.Header = Header;
