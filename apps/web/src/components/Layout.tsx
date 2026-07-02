import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { getUser, logout } from '../lib/auth';
import { LogOutIcon } from './icons';
import logoWordmark from '../assets/brand/logo-wordmark-white.png';

const rollenLabels: Record<string, string> = {
  admin_gf: 'Admin / GF',
  teamleiter: 'Teamleiter',
  backoffice: 'Backoffice',
  aussendienst: 'Außendienst',
};

interface NavItem {
  to: string;
  label: string;
  roles?: string[];
}

const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/verwaltung/organisationen', label: 'Organisationen' },
  { to: '/verwaltung/verkaeufer', label: 'Verkäufer', roles: ['admin_gf', 'teamleiter', 'backoffice'] },
  { to: '/verwaltung/produkte', label: 'Produkte' },
  { to: '/import', label: 'Import', roles: ['admin_gf', 'teamleiter', 'backoffice'] },
  { to: '/provisionslaeufe', label: 'Provisionsläufe', roles: ['admin_gf', 'teamleiter', 'backoffice'] },
  { to: '/verwaltung/provisionsregeln', label: 'Provisionsregeln', roles: ['admin_gf'] },
  { to: '/verwaltung/benutzer', label: 'Benutzer', roles: ['admin_gf'] },
];

export default function Layout() {
  const user = getUser();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => { logout(); navigate('/login'); };
  const items = NAV_ITEMS.filter(i => !i.roles || (user && i.roles.includes(user.rolle)));

  return (
    <div className="min-h-screen">
      <div className="ambient" />

      <header className="sticky top-0 z-50 border-b border-line/80 bg-night/75 backdrop-blur-xl">
        <div className="mx-auto max-w-[1280px] px-6 flex items-center h-[68px] gap-6">
          <NavLink to="/dashboard" className="shrink-0 group" aria-label="BlitzON Consulting – Dashboard">
            <img
              src={logoWordmark}
              alt="BlitzON Consulting"
              className="h-[46px] w-auto transition-all duration-300 group-hover:drop-shadow-[0_0_14px_rgba(8,184,231,0.55)]"
            />
          </NavLink>

          <nav className="ml-auto flex gap-1 flex-wrap items-center">
            {items.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `relative text-[13px] font-medium px-3.5 py-2 rounded-xl transition-all duration-200 ${
                    isActive
                      ? 'text-white bg-brand/10 shadow-[inset_0_0_0_1px_rgba(8,184,231,0.35)]'
                      : 'text-steel2 hover:text-white hover:bg-white/[0.04]'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-3 pl-4 border-l border-line/80">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-brand-soft to-brand-deep flex items-center justify-center text-night text-xs font-black uppercase select-none">
              {user?.email?.[0] ?? '?'}
            </div>
            <div className="hidden lg:block leading-tight">
              <div className="text-[12px] font-semibold text-ink max-w-[180px] truncate">{user?.email}</div>
              <div className="text-[10.5px] text-steel">{rollenLabels[user?.rolle ?? ''] ?? user?.rolle}</div>
            </div>
            <button
              onClick={handleLogout}
              title="Abmelden"
              className="h-9 w-9 rounded-xl border border-line text-steel2 flex items-center justify-center transition-all duration-200 hover:text-red hover:border-red/40 hover:bg-red/5"
            >
              <LogOutIcon size={15} />
            </button>
          </div>
        </div>
      </header>

      <main key={location.pathname} className="mx-auto max-w-[1280px] px-6 py-10 animate-fade-in">
        <Outlet />
      </main>

      <footer className="mx-auto max-w-[1280px] px-6 pb-8 pt-2 flex items-center justify-between text-[11px] text-steel">
        <span>© {new Date().getFullYear()} BlitzON Consulting</span>
        <span className="tracking-[2px] uppercase">Energy. Sales. Performance.</span>
      </footer>
    </div>
  );
}
