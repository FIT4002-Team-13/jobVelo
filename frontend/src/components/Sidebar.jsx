import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, CalendarDays, Briefcase, Users } from 'lucide-react';
import logoFull from '../assets/logo-full.png';

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();

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
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '9px 14px',
          borderRadius: '8px',
          fontSize: '14px',
          fontWeight:  isActive ? '600'     : '400',          // Make active menu item bolder
          color:       isActive ? '#2563EB' : '#64748B',      // Highlight active item in blue
          background:  isActive ? '#EFF6FF' : 'transparent',  // Add light blue background for active item
          textDecoration: 'none',
          transition: 'all 0.15s',
        }}
      >
        <span style={{ color: isActive ? '#2563EB' : '#94A3B8' }}> 
          {item.icon}
        </span>
        {item.label}
      </Link>
    );
  };

  return (
    <aside style={{
      width: '180px',
      flexShrink: 0,
      background: '#FFFFFF',
      borderRight: '1px solid #E2E8F0',
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      position: 'sticky',
      top: 0,
    }}>
      {/* Logo */}
      <div style={{ padding: '20px 16px 24px' }}>
        <img src={logoFull} alt="Logo" style={{ height: '32px', width: 'auto' }} />
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '0 8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span style={{ fontSize: '10px', fontWeight: '700', color: '#94A3B8', letterSpacing: '0.08em', padding: '0 8px 6px' }}>MAIN</span>
        {mainItems.map(navLink)}   

        <span style={{ fontSize: '10px', fontWeight: '700', color: '#94A3B8', letterSpacing: '0.08em', padding: '16px 8px 6px' }}>GROUP</span>
        {groupItems.map(navLink)}  
      </nav>

      {/* User + Logout */}
      <div style={{ padding: '16px', borderTop: '1px solid #E2E8F0' }}>
        <div style={{ fontSize: '13px', fontWeight: '600', color: '#1E293B', marginBottom: '12px' }}>
          John Doe
        </div>
        <button
          onClick={() => navigate('/')}
          style={{
            width: '100%',
            padding: '8px',
            background: '#FEF2F2',
            color: '#EF4444',
            border: '1px solid #FECACA',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: '500',
            cursor: 'pointer',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => e.target.style.background = '#FEE2E2'} // Darker red background when hovering
          onMouseLeave={e => e.target.style.background = '#FEF2F2'} // Reset background when mouse leaves
        >
          Log Out
        </button>
      </div>
    </aside>
  );
}