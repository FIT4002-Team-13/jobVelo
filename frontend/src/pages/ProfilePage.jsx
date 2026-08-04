import { useAuth } from "../lib/AuthContext";
import Sidebar from '../components/common/Sidebar'
import { page } from '../styles/layout'
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

    <div className="grid grid-cols-[1fr_2fr] items-start gap-4 mt-6">

      <div className="flex flex-col gap-4">
        <div className="bg-white border p-5 rounded-xl">
          <div className="flex flex-col items-center text-center">
            <div className="w-24 h-24 rounded-pill bg-primary-500 flex items-center justify-center text-white font-bold text-3xl">
              {initials}
            </div>
            <h2 className="mt-4 text-4xl font-bold tracking-tight text-neutral-800">
              {user.full_name}
            </h2>
            <p className="mt-1 text-sm font-medium text-primary-500">
              {roleLabel}
            </p>
            <p className="mt-3 text-sm text-neutral-500">
              {user.email}
            </p>
          </div>
        </div>

        {/* To be refined in US35. Currently uses hardcoded data for everything. */}
        <div className="bg-white border rounded-xl p-5  col-span-2">
            <div className="flex flex-col gap-3">
            <div>
              <p className="mt-1 text-sm font-medium text-neutral-500">TOTAL INTERVIEWS</p>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-bold text-neutral-800">20</p>
                <StatDelta value="+3%" label="from past 7 days" />
              </div>
            </div>
            <div>
              <p className="mt-1 text-sm font-medium text-neutral-500 mb-1">HIRE RATE</p>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-bold text-neutral-800">2</p>
                <StatDelta value="-50%" label="from last month" />
              </div>
            </div>
            <div>
              <p className="mt-1 text-sm font-medium text-neutral-500 mb-1">AVERAGE CANDIDATE SCORE</p>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-bold text-neutral-800">7.4</p>
                <StatDelta value="+10%" label="from last month" />
              </div>
            </div> 
            <div className="flex flex-col gap-2">
              <p className="mt-1 text-sm font-medium text-neutral-500 mb-1">
                SCORE TRENDS
              </p>
              <div className="flex items-end gap-3 h-28">
                {stats.map(d => (
                    <div key={d.m} className="flex flex-col items-center gap-1 flex-1">
                      <div
                        className={`w-8 rounded-t-md ${colorMap.get(d.m)}`}
                        style={{ height: `${d.v * 12}px` }}
                      />
                      <p className="text-xs text-neutral-600">{d.m}</p>
                    </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>


      <div className="flex flex-col gap-4">
        {/* To be refined in US34. Currently uses hardcoded data and comment function does not work. */}
        <div className="bg-white border rounded-xl p-5 col-span-3 ">
          <h2 className="text-lg font-semibold text-neutral-800 mb-4">
            Strengths
          </h2>

          <div className="space-y-3">
            {strengths.map((item, idx) => (
              <div
                key={idx}
                className="group bg-neutral-100 rounded-xl px-4 py-3 flex items-center justify-between"
              >
                <div>
                  <p className="text-sm font-bold text-neutral-800">
                    {item.title}
                  </p>
                  <p className="text-sm text-neutral-500 mt-1">
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
        <div className="bg-white border rounded-xl p-5 col-span-3">
          <h2 className="text-lg font-semibold text-neutral-800 mb-4">
            Improvements
          </h2>

          <div className="space-y-3">
            {improvements.map((item, idx) => (
              <div
                key={idx}
                className="group bg-neutral-100 rounded-xl px-4 py-3 flex items-center justify-between"
              >
                <div>
                  <p className="text-sm font-bold text-neutral-800">
                    {item.title}
                  </p>
                  <p className="text-sm text-neutral-500 mt-1">
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
    const [setLoading] = useState(true);
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
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-[2fr_3fr] gap-6 items-start">

          {/* Left — Company Branding */}
          <div className="bg-white border rounded-xl p-6 flex flex-col gap-5">
            <h2 className="text-lg font-semibold text-neutral-800">Company Branding</h2>

            {/* Logo */}
            <div className="border rounded-xl p-4 flex flex-col items-center gap-3">
              {logoUrl
                ? <img src={`${logoUrl}?t=${Date.now()}`} alt="Company logo" className="h-40 object-contain" />
                : <div className="h-20 w-20 rounded-full bg-neutral-200 flex items-center justify-center text-neutral-400 text-sm">No logo</div>
              }
              <button
                onClick={() => fileRef.current?.click()}
                className="text-sm text-primary-500 flex items-center gap-1 hover:underline"
              >
                ✏️ Edit Logo
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
          <div className="flex flex-col gap-6">
            <div className="bg-white border rounded-xl p-6 flex flex-col gap-2">
              <h2 className="text-lg font-semibold text-neutral-800">Company Description</h2>
              <textarea
                name="comp_description"
                value={form.comp_description}
                onChange={handleChange}
                maxLength={500}
                rows={5}
                className="border rounded-lg px-3 py-2 text-sm text-neutral-800 resize-none focus:outline-none focus:ring-2 focus:ring-primary-300"
              />
              <p className="text-xs text-neutral-400 text-right">
                {(form.comp_description ?? '').length}/500
              </p>
            </div>

            <div className="bg-white border rounded-xl p-6 flex flex-col gap-4">
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
        <div className="flex justify-end items-center gap-4">
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
      <div className="flex min-h-screen bg-neutral-50">
        <Sidebar user={user} />
        <main className={page.main}>
          <div className="mb-6">
            <h1 className="text-4xl font-extrabold tracking-tight text-neutral-800">
              My Profile
            </h1>
            <p className="text-xs text-neutral-400 mt-1">
              Your interviewing performance and feedback
            </p>
          </div>
          {profileGrid}
        </main>
      </div>
    );
  }        

  return (
    <div className="flex min-h-screen bg-neutral-50">
      <Sidebar user={user} />
      <main className={page.main}>

        <div className="mb-6">
          <h1 className="text-4xl font-extrabold tracking-tight text-neutral-800">
            Profile
          </h1>
          <p className="text-xs text-neutral-400 mt-1">
            Your interviewing performance and feedback
          </p>
        </div>

        <div className="flex border-b border-neutral-200 mb-6">
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

        {activeTab === 'profile' && profileGrid}    

        {activeTab === 'company' && (
          <CompanyProfileTab compId={user.comp_id} />
        )}

      </main>
    </div>
  );
}