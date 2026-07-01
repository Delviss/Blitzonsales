import { NavLink, useNavigate } from 'react-router-dom';
import { getUser, logout } from '../lib/auth';

const navItems = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/verwaltung/organisationen', label: 'Organisationen' },
  { to: '/verwaltung/verkaeufer', label: 'Verkäufer' },
  { to: '/verwaltung/produkte', label: 'Produkte' },
  { to: '/verwaltung/benutzer', label: 'Benutzer' },
];

export default function NavBar() {
  const navigate = useNavigate();
  const user = getUser();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <header className="bg-panel border-b border-white/10 px-6 py-3 flex items-center gap-8">
      <span className="text-lime font-bold text-lg tracking-tight select-none">⚡ BlitzON</span>
      <nav className="flex gap-4 flex-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `text-sm font-medium px-3 py-1 rounded transition-colors ${
                isActive
                  ? 'text-lime'
                  : 'text-steel2 hover:text-white'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="flex items-center gap-3 text-sm text-steel2">
        <span>{user?.email}</span>
        <span className="text-xs bg-white/10 px-2 py-0.5 rounded">{user?.rolle}</span>
        <button
          onClick={handleLogout}
          className="text-xs text-red hover:underline"
        >
          Abmelden
        </button>
      </div>
    </header>
  );
}
