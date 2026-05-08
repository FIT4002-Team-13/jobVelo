import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import logoFull from '../assets/logo-full.png';

const HomeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
  </svg>
);

const ScheduleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z"/>
  </svg>
);

const JobsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M20 6h-2.18c.07-.44.18-.86.18-1.3C18 2.57 15.43 0 12.3 0c-1.85 0-3.48.92-4.49 2.33L6 4.05 4.19 2.33C3.18.92 1.55 0-.3 0-3.43 0-6 2.57-6 5.7c0 .44.11.86.18 1.3H-8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h28c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z"/>
    <path d="M20 6H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-9 13H7v-2h4v2zm0-4H7v-2h4v2zm0-4H7V9h4v2zm6 8h-4v-2h4v2zm0-4h-4v-2h4v2zm0-4h-4V9h4v2z"/>
  </svg>
);

const CandidatesIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
  </svg>
);

export default function Sidebar({ user = { name: 'John Doe', role: 'Interviewer' } }) {
  const location = useLocation();
  const navigate = useNavigate();

  const initials = user.name.split(' ').map(n => n[0]).join('');

  const navItems = [
    { label: 'Dashboard', path: '/dashboard', icon: <HomeIcon />, group: 'MAIN' },
    { label: 'Schedules', path: '/schedules', icon: <ScheduleIcon />, group: 'MAIN' },
    { label: 'Jobs', path: '/jobs', icon: <JobsIcon />, group: 'GROUP' },
    { label: 'Candidates', path: '/candidates', icon: <CandidatesIcon />, group: 'GROUP' },
  ];

  const mainItems = navItems.filter(i => i.group === 'MAIN');
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
          fontWeight: isActive ? '600' : '400',
          color: isActive ? '#2563EB' : '#64748B',
          background: isActive ? '#EFF6FF' : 'transparent',
          textDecoration: 'none',
          transition: 'all 0.15s',
        }}
      >
        <span style={{ color: isActive ? '#2563EB' : '#94A3B8' }}>{item.icon}</span>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
          <div style={{
            width: '36px', height: '36px', borderRadius: '50%',
            background: 'linear-gradient(135deg, #2563EB, #06B6D4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', fontWeight: '700', fontSize: '13px', flexShrink: 0,
          }}>
            {initials}
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: '600', color: '#1E293B' }}>{user.name}</div>
            <div style={{ fontSize: '11px', color: '#94A3B8' }}>{user.role}</div>
          </div>
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
          onMouseEnter={e => e.target.style.background = '#FEE2E2'}
          onMouseLeave={e => e.target.style.background = '#FEF2F2'}
        >
          Log Out
        </button>
      </div>
    </aside>
  );
}