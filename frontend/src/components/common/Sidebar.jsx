import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, CalendarDays, Briefcase, Users } from 'lucide-react';
import logoFull from '../../assets/logo-final.png';
import { useAuth } from '../../lib/AuthContext.jsx';

// `user` is the shape returned by /api/auth/me (UserOut). The prop is
// optional - if the parent doesn't pass one (e.g. JobsPage / JobDetailPage),
// we fall back to the AuthContext's user so the sidebar stays consistent
// across every page without each page having to fetch /api/auth/me itself.
export default function Sidebar({ user: userProp }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user: ctxUser, logout } = useAuth();
  const user = userProp ?? ctxUser;

  // Properly clear the JWT + auth state, then bounce to the landing page.
  // Without logout() the token would stay in localStorage and the user
  // would silently re-authenticate on the next visit.
  const handleLogout = () => {
    logout();
    navigate('/', { replace: true });
  };

  // Prefer the new full_name field; fall back to legacy `name` (mock user)
  // or username so a partially-migrated doc still shows something sensible.
  const displayName = user?.full_name || user?.name || user?.username || '';
  const initials = displayName
    ? displayName.split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : '?';
  const roleLabel = formatRole(user?.role);

  const navItems = [
    { label: 'Dashboard',  path: '/dashboard',  icon: <LayoutDashboard size={16} />, group: 'MAIN'  },
    { label: 'Schedules',  path: '/schedules',  icon: <CalendarDays    size={16} />, group: 'MAIN'  },
    { label: 'Jobs',       path: '/jobs',        icon: <Briefcase       size={16} />, group: 'GROUP' },
    { label: 'Candidates', path: '/candidates',  icon: <Users           size={16} />, group: 'GROUP' },
  ];

  const mainItems  = navItems.filter(i => i.group === 'MAIN');
  const groupItems = navItems.filter(i => i.group === 'GROUP');


  const navLink = (item) => {
    // Mark the link as active when its path matches OR when we're on a
    // nested route below it (e.g. /jobs/123 should highlight the Jobs link).
    const isActive =
      location.pathname === item.path ||
      location.pathname.startsWith(item.path + '/');
    return (
      <Link
        key={item.path}
        to={item.path}
        aria-current={isActive ? 'page' : undefined}
        className={`group relative flex items-center gap-2.5 pl-5 pr-3.5 py-2.5 rounded-md text-sm no-underline transition-colors ${
          isActive
            ? 'font-semibold text-primary-500 bg-primary-500/20'
            : 'font-normal text-neutral-500 hover:text-primary-600 hover:bg-primary-500/20'
        }`}
      >
        {/* Left-edge indicator pill - solid primary, visible when active or hovered. */}
        <span
          aria-hidden
          className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-pill bg-primary-500 transition-opacity ${
            isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
        />
        <span
          className={`transition-colors ${
            isActive ? 'text-primary-500' : 'text-neutral-400 group-hover:text-primary-500'
          }`}
        >
          {item.icon}
        </span>
        {item.label}
      </Link>
    );
  };

  return (
    <aside className="w-[200px] shrink-0 bg-neutral-0 border-r border-neutral-200 flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="pt-5 px-4 pb-6 flex items-center justify-center">
        <img src={logoFull} alt="Logo" className="h-16 w-auto" />
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 flex flex-col gap-1">
        <span className="text-xs font-bold text-neutral-400 tracking-[0.08em] px-2 pb-1.5">MAIN</span>
        {mainItems.map(navLink)}

        <span className="text-xs font-bold text-neutral-400 tracking-[0.08em] px-2 pt-4 pb-1.5">GROUP</span>
        {groupItems.map(navLink)}
      </nav>

      {/* User + Logout */}
      <div className="p-4 border-t border-neutral-200">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-9 h-9 rounded-pill bg-primary-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
            {initials}
          </div>
          <div>
            <div className="text-sm font-semibold text-neutral-800">{displayName || 'Loading…'}</div>
            <div className="text-xs text-neutral-400">{roleLabel}</div>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="w-full py-2 bg-coral-50 text-coral-500 border border-coral-200 rounded-md text-sm font-medium cursor-pointer hover:bg-coral-100 transition-colors"
        >
          Log Out
        </button>
      </div>
    </aside>
  );
}

// "hiring_manager" -> "Hiring Manager", etc. Inline because Sidebar is the
// only place that renders the role label right now.
function formatRole(role) {
  if (!role) return '';
  return role.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
}