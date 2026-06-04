import { useAuth } from "../lib/AuthContext";
import Sidebar from '../components/common/Sidebar'
import { button, modal, page } from '../styles/layout'
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
    const [loading, setLoading] = useState(true);
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
      } catch (e) {
        setError('Failed to upload logo.');
      }
    };

    useEffect(() => {
      api.getCompany(compId)
        .then((data) => {
          setCompany(data);
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