import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';

// Admin-only editor for the company's branding and contact details.
// Rendered by CompanyProfilePage (used to be a tab inside ProfilePage).
export default function CompanyProfileForm({ compId }) {
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
