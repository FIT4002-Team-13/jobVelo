import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, CalendarDays, Briefcase, Users } from 'lucide-react';
import logoFull from '../assets/logo-full.png';

//Mock user data for now - in a real app, this would come from context or props
export default function Sidebar({ user = { name: 'John Doe', role: 'Interviewer' } }) {
  const location = useLocation();
  const navigate = useNavigate();


  const initials = user.name.split(' ').map(n => n[0]).join('');

  const navItems = [
    { label: 'Dashboard',  path: '/dashboard',  icon: <LayoutDashboard size={16} />, group: 'MAIN'  },
    { label: 'Schedules',  path: '/schedules',  icon: <CalendarDays    size={16} />, group: 'MAIN'  },
    { label: 'Jobs',       path: '/jobs',        icon: <Briefcase       size={16} />, group: 'GROUP' },
    { label: 'Candidates', path: '/candidates',  icon: <Users           size={16} />, group: 'GROUP' },
  ];

  const mainItems  = navItems.filter(i => i.group === 'MAIN');
  const groupItems = navItems.filter(i => i.group === 'GROUP');


  const navLink = (item) => {
    const isActive = location.pathname === item.path;
    return (
      <Link
        key={item.path}
        to={item.path}
        className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-md text-sm no-underline transition-all ${
          isActive
            ? 'font-semibold text-primary-500 bg-primary-50'
            : 'font-normal text-neutral-500 bg-transparent'
        }`}
      >
        <span className={isActive ? 'text-primary-500' : 'text-neutral-400'}>
          {item.icon}
        </span>
        {item.label}
      </Link>
    );
  };

  return (
    <aside className="w-[180px] shrink-0 bg-neutral-0 border-r border-neutral-200 flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="pt-5 px-4 pb-6">
        <img src={logoFull} alt="Logo" className="h-8 w-auto" />
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
          <div className="w-9 h-9 rounded-pill bg-brand-gradient flex items-center justify-center text-white font-bold text-sm shrink-0">
            {initials}
          </div>
          <div>
            <div className="text-sm font-semibold text-neutral-800">{user.name}</div>
            <div className="text-xs text-neutral-400">{user.role}</div>
          </div>
        </div>

        <button
          onClick={() => navigate('/')}
          className="w-full py-2 bg-coral-50 text-coral-500 border border-coral-200 rounded-md text-sm font-medium cursor-pointer hover:bg-coral-100 transition-colors"
        >
          Log Out
        </button>
      </div>
    </aside>
  );
}