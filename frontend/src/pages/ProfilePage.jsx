import { useAuth } from "../lib/AuthContext";
import Sidebar from '../components/common/Sidebar'
import commentIcon from '../assets/icons/comment.png'
import StatDelta from '../components/common/StatDelta';
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

export default function Profile() {
  const { user } = useAuth();  
  const [activeTab, setActiveTab] = useState('profile');

  if (!user) return <div>Loading...</div>;

  const displayName =  user?.full_name || user?.name || user?.username || '';

  const initials = displayName
    ? displayName
        .split(' ')
        .filter(Boolean)
        .map(n => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : '?';

  const roleLabel = user?.role
    ? user.role
        .split('_')
        .map(w => w[0].toUpperCase() + w.slice(1))
        .join(' ')
    : '';

  // Note: Strengths and Improvements are hardcoded for now but will be created by US34
  const strengths = [
    {
      title: "Strong Communication",
      description: "Clearly explains technical concepts and collaborates well with interviewers. Writes clean, readable code and provides thoughtful comments when needed."
    },
    {
      title: "Fast Learner",
      description: "Adapts quickly to new technologies and unfamiliar workflows."
    },
    {
      title: "Team Player",
      description: "Works effectively with cross-functional teams and contributes positively."
    },
    {
      title:"test",
      description: "test"
    }
  ]

  const improvements = [
    {
      title: "System Design Depth",
      description: "Needs stronger understanding of scalable architecture patterns and trade-offs when designing larger systems."
    },
    {
      title: "Edge Case Handling",
      description: "Occasionally misses less obvious edge cases in problem-solving scenarios, especially under time pressure."
    },
    {
      title: "Code Optimisation",
      description: "Can improve awareness of time and space complexity when writing initial solutions, with more refinement in later iterations."
    }
  ]

  // Note: Stats are hardcoded for now but will be created by US35
  const stats = [
    { m: "Jan", v: 1.1},
    { m: "Feb", v: 2.7 },
    { m: "Mar", v: 5.2 },
    { m: "Apr", v: 8.2 },
    { m: "May", v: 6.8 },
    { m: "Now", v: 7.4 },
  ];
  const sorted = [...stats].sort((a, b) => a.v - b.v);
  const colorMap = new Map();
  sorted.slice(0, 2).forEach(d => colorMap.set(d.m, "bg-red-200"));
  sorted.slice(2, 4).forEach(d => colorMap.set(d.m, "bg-blue-200"));
  sorted.slice(4).forEach(d => colorMap.set(d.m, "bg-green-200"));
              
  const profileGrid = (

    <div className="grid h-full min-h-0 w-full grid-cols-[minmax(260px,1fr)_minmax(0,2fr)] items-stretch gap-4">

      <div className="grid min-h-0  min-w-0 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] gap-4">
        <div className="bg-white border p-4 rounded-xl">
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-pill bg-primary-500 flex items-center justify-center text-white font-bold text-2xl">
              {initials}
            </div>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-neutral-800">
              {user.full_name}
            </h2>
            <p className="mt-1 text-sm font-medium text-primary-500">
              {roleLabel}
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              {user.email}
            </p>
          </div>
        </div>

        {/* To be refined in US35. Currently uses hardcoded data for everything. */}
        <div className="bg-white border rounded-xl p-3  ">
            <div className="grid h-full min-h-0 grid-rows-[64px_64px_minmax(0,1fr)] gap-3">
              <div className="flex flex-col justify-center">
                <p className="text-xs font-medium text-neutral-500 pb-1">
                  TOTAL INTERVIEWS
                </p>
                <div className="flex items-center justify-between">
                  <p className="text-xl font-bold text-neutral-800">20</p>
                  <StatDelta value="+3%" label="from past 7 days" />
                </div>
              </div>

              <div className="flex flex-col justify-center">
                <p className="text-xs font-medium text-neutral-500 pb-1">
                  AVERAGE CANDIDATE SCORE
                </p>
                <div className="flex items-center justify-between">
                  <p className="text-xl font-bold text-neutral-800">7.4</p>
                  <StatDelta value="+10%" label="from last month" />
                </div>
              </div>

              <div className="flex min-h-0 flex-col gap-2">
                <p className="shrink-0 text-xs font-medium text-neutral-500">
                  SCORE TRENDS
                </p>

                <div className="flex min-h-0 flex-1 gap-3">
                  {stats.map((d) => (
                    <div key={d.m} className="flex h-full min-w-0 flex-1 flex-col items-center gap-1">
                      <div className="flex min-h-0 w-full flex-1 items-end justify-center">
                        <div
                          className={`w-8 rounded-t-md ${colorMap.get(d.m)}`}
                          style={{ height: `${(d.v / 10) * 100}%` }}
                        />
                      </div>

                      <p className="shrink-0 text-xs text-neutral-600">
                        {d.m}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
        </div>
      </div>


      <div className="grid min-h-0 min-w-0 grid-cols-1 grid-rows-2 gap-4">
        {/* To be refined in US34. Currently uses hardcoded data and comment function does not work. */}
        <div className="min-h-0 overflow-hidden bg-white border rounded-xl p-3 flex flex-col ">
          <h2 className="text-lg font-semibold text-neutral-800 mb-3">
            Strengths
          </h2>

          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-2 scrollbar-primary">
            {strengths.map((item, idx) => (
              <div
                key={idx}
                className="group shrink-0 bg-neutral-100 rounded-xl px-3 py-2 flex items-center justify-between"
              >
                <div className="min-w-0 pr-3">
                  <p className="text-sm font-bold text-neutral-800">
                    {item.title}
                  </p>
                  <p className="line-clamp-2 text-xs leading-snug text-neutral-500 mt-0.5">
                    {item.description}
                  </p>
                </div>
                <div className="flex items-center justify-center">
                  <img 
                    src={commentIcon} 
                    alt="Comment" 
                    className="w-4 h-4 opacity-40 hover:opacity-90 transition shrink-0"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* To be refined in US34. Currently uses hardcoded data and comment function does not work. */}
        <div className="flex min-h-0 flex-col overflow-hidden bg-white border rounded-xl p-3">
          <h2 className="text-lg font-semibold text-neutral-800 mb-3">
            Improvements
          </h2>

          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-2 scrollbar-primary">
            {improvements.map((item, idx) => (
              <div
                key={idx}
                className="group shrink-0 bg-neutral-100 rounded-xl px-3 py-2 flex items-center justify-between"
              >
                <div className="min-w-0 pr-3">
                  <p className="text-sm font-bold text-neutral-800">
                    {item.title}
                  </p>
                  <p className="line-clamp-2 text-xs leading-snug text-neutral-500 mt-0.5">
                    {item.description}
                  </p>
                </div>
                <div className="flex items-center justify-center">
                  <img 
                    src={commentIcon} 
                    alt="Comment" 
                    className="w-4 h-4 opacity-40 hover:opacity-90 transition shrink-0"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  function CompanyProfileTab({ compId }) {
    const [company, setCompany] = useState(null);
    const [form, setForm] = useState({});
    const [, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(false);
    const fileRef = useRef();
    const handleLogoChange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const formData = new FormData();
      formData.append('logo', file);

      try {
        const updated = await api.updateCompanyLogo(compId, formData);
        setCompany(updated);
      } catch {
        setError('Failed to upload logo.');
      }
    };

    useEffect(() => {
      api.getCompany(compId)
        .then((data) => {
          setCompany(data);
                console.log('company data:', data);

          setForm({
            comp_name: data.comp_name ?? '',
            comp_industry: data.comp_industry ?? '',
            comp_description: data.comp_description ?? '',
            comp_email: data.comp_email ?? '',
            comp_contact: data.comp_contact ?? '',
            comp_website: data.comp_website ?? '',
          });
        })
        .catch(() => setError('Failed to load company profile.'))
        .finally(() => setLoading(false));
    }, [compId]);

    const handleChange = (e) => {
      setForm(f => ({ ...f, [e.target.name]: e.target.value }));
      setSuccess(false);
    };

    const handleSave = async () => {

      if (!form.comp_name.trim()) return setError('Company name is required.');
      if (!form.comp_industry.trim()) return setError('Industry is required.');
      if (!form.comp_email.trim()) return setError('Email is required.');
      if (!form.comp_contact.trim()) return setError('Contact number is required.');

      setSaving(true);
      setError(null);
      try {
        const updated = await api.updateCompany(compId, form);
        setCompany(updated);
        setSuccess(true);
      } catch (e) {
        setError(e.message || 'Failed to save.');
      } finally {
        setSaving(false);
      }
    };

    const logoUrl = company?.comp_logo
      ? `/api/files/${company.comp_logo}`
      : null;

    return (
      <div className="flex h-full min-h-0 flex-col gap-3">
        <div className="grid min-h-0 flex-1 grid-cols-[2fr_3fr] gap-4 items-stretch">

          {/* Left — Company Branding */}
          <div className="bg-white border rounded-xl p-4 flex min-h-0 flex-col gap-3">
            <h2 className="text-lg font-semibold text-neutral-800">Company Branding</h2>

            {/* Logo */}
            <div className="border rounded-xl p-3 flex min-h-0 flex-1 flex-col items-center justify-center gap-2">
              {logoUrl
                ? <img src={`${logoUrl}?t=${Date.now()}`} alt="Company logo" className="max-h-40 max-w-full object-contain" />
                : <div className="h-20 w-20 rounded-full bg-neutral-200 flex items-center justify-center text-neutral-400 text-sm">No logo</div>
              }
              <button
                onClick={() => fileRef.current?.click()}
                className="text-sm text-primary-500 flex pt-2 items-center gap-1 hover:underline"
              >
                Edit Logo
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleLogoChange}
              />
            </div>

            {/* Company Name */}
            <div className="flex flex-col gap-1">
              <label className="text-sm text-neutral-500">Company Name</label>
              <input
                name="comp_name"
                value={form.comp_name}
                onChange={handleChange}
                className="border rounded-lg px-3 py-2 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-primary-300"
              />
            </div>

            {/* Industry */}
            <div className="flex flex-col gap-1">
              <label className="text-sm text-neutral-500">Industry</label>
              <input
                name="comp_industry"
                value={form.comp_industry}
                onChange={handleChange}
                className="border rounded-lg px-3 py-2 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-primary-300"
              />
            </div>
          </div>

          {/* Right — Description + Contact */}
          <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3">
            <div className="bg-white border rounded-xl p-4 flex flex-col gap-2">
              <h2 className="text-lg font-semibold text-neutral-800">Company Description</h2>
              <textarea
                name="comp_description"
                value={form.comp_description}
                onChange={handleChange}
                maxLength={500}
                rows={4}
                className="border rounded-lg px-3 py-2 text-sm text-neutral-800 resize-none focus:outline-none focus:ring-2 focus:ring-primary-300"
              />
              <p className="text-xs text-neutral-400 text-right">
                {(form.comp_description ?? '').length}/500
              </p>
            </div>

            <div className="bg-white border rounded-xl p-4 flex min-h-0 flex-col overflow-hidden gap-3">
              <h2 className="text-lg font-semibold text-neutral-800">Contact Details</h2>

              <div className="flex flex-col gap-1">
                <label className="text-sm text-neutral-500">Email Address</label>
                <input
                  name="comp_email"
                  value={form.comp_email}
                  onChange={handleChange}
                  className="border rounded-lg px-3 py-2 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-primary-300"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-sm text-neutral-500">Contact Number</label>
                <input
                  name="comp_contact"
                  value={form.comp_contact}
                  onChange={handleChange}
                  className="border rounded-lg px-3 py-2 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-primary-300"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-sm text-neutral-500">Website</label>
                <input
                  name="comp_website"
                  value={form.comp_website}
                  onChange={handleChange}
                  className="border rounded-lg px-3 py-2 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-primary-300"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Save Row */}
        <div className="flex shrink-0 justify-end items-center gap-4">
          {success && <p className="text-sm text-green-500">Changes saved successfully.</p>}
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-primary-500 hover:bg-primary-600 text-white text-sm font-semibold py-2 px-6 rounded-xl transition-colors cursor-pointer"      
            >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    );
  }  


  if (user?.role !== 'admin') {
    return (
      <div className="flex h-screen overflow-hidden bg-neutral-50">
        <Sidebar user={user} />

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <header className="shrink-0 border-b border-neutral-100 bg-white px-10 py-5">
            <h1 className="text-3xl font-extrabold tracking-tight text-neutral-800">
              My Profile
            </h1>
            <p className="mt-1 text-sm text-neutral-400">
              Your interviewing performance and feedback
            </p>
          </header>

          <section className="min-h-0 flex-1 overflow-hidden p-6">
            {profileGrid}
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-neutral-50">
      <Sidebar user={user} />

      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="shrink-0 border-b border-neutral-100 bg-white px-10 py-5">
          <h1 className="text-3xl font-extrabold tracking-tight text-neutral-800">
            Profile
          </h1>
          <p className="mt-1 text-sm text-neutral-400">
            Manage your personal and company profile
          </p>
        </header>

        <div className="flex shrink-0 border-b border-neutral-200 bg-neutral-100 px-8">
          <button
            onClick={() => setActiveTab('profile')}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'profile'
                ? 'border-primary-500 text-primary-500'
                : 'border-transparent text-neutral-400 hover:text-neutral-600'
            }`}
          >
            My Profile
          </button>

          <button
            onClick={() => setActiveTab('company')}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'company'
                ? 'border-primary-500 text-primary-500'
                : 'border-transparent text-neutral-400 hover:text-neutral-600'
            }`}
          >
            Company Profile
          </button>
        </div>

        <section className="min-h-0 flex-1 overflow-hidden p-5">
          {activeTab === 'profile' && profileGrid}

          {activeTab === 'company' && (
            <CompanyProfileTab compId={user.comp_id} />
          )}
        </section>
      </main>
    </div>
  );
}