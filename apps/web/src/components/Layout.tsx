import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { getUser, logout } from '../lib/auth';

export default function Layout() {
  const user = getUser();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <div className="min-h-screen bg-navy">
      <header className="sticky top-0 z-50 border-b border-line bg-navy/90 backdrop-blur-md">
        <div className="mx-auto max-w-[1180px] px-7 flex items-center h-[62px] gap-4">
          <div className="flex items-center gap-2.5 font-extrabold tracking-wide">
            <span className="spark" style={{
              width: 14, height: 14, background: '#8BC53F', display: 'inline-block',
              clipPath: 'polygon(45% 0,100% 0,55% 45%,100% 45%,0 100%,40% 55%,0 55%)'
            }} />
            BlitzON<small className="font-medium text-steel text-[11px] tracking-[2px] ml-1">CONTROL</small>
          </div>

          <nav className="ml-auto flex gap-1 flex-wrap">
            <NavLink to="/dashboard" className={({ isActive }) =>
              `text-[12.5px] px-3 py-1.5 rounded-lg border transition-colors ${isActive ? 'text-white border-lime' : 'text-steel2 border-transparent hover:text-white hover:border-line'}`
            }>Dashboard</NavLink>
            <NavLink to="/verwaltung/organisationen" className={({ isActive }) =>
              `text-[12.5px] px-3 py-1.5 rounded-lg border transition-colors ${isActive ? 'text-white border-lime' : 'text-steel2 border-transparent hover:text-white hover:border-line'}`
            }>Organisationen</NavLink>
            <NavLink to="/verwaltung/verkaeufer" className={({ isActive }) =>
              `text-[12.5px] px-3 py-1.5 rounded-lg border transition-colors ${isActive ? 'text-white border-lime' : 'text-steel2 border-transparent hover:text-white hover:border-line'}`
            }>Verkäufer</NavLink>
            <NavLink to="/verwaltung/produkte" className={({ isActive }) =>
              `text-[12.5px] px-3 py-1.5 rounded-lg border transition-colors ${isActive ? 'text-white border-lime' : 'text-steel2 border-transparent hover:text-white hover:border-line'}`
            }>Produkte</NavLink>
            {user?.rolle === 'admin_gf' && (
              <NavLink to="/verwaltung/benutzer" className={({ isActive }) =>
                `text-[12.5px] px-3 py-1.5 rounded-lg border transition-colors ${isActive ? 'text-white border-lime' : 'text-steel2 border-transparent hover:text-white hover:border-line'}`
              }>Benutzer</NavLink>
            )}
          </nav>

          <div className="flex items-center gap-3 ml-4">
            <span className="text-[12px] text-steel2">{user?.email}</span>
            <button onClick={handleLogout} className="text-[12px] text-steel hover:text-white transition-colors">Abmelden</button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1180px] px-7 py-10">
        <Outlet />
      </main>
    </div>
  );
}
