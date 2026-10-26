import Sidebar from '../components/common/Sidebar'
import CompanyProfileForm from '../components/admin/CompanyProfileForm.jsx'
import { useAuth } from '../lib/AuthContext'

// Admin-only page (route sits behind RequireRole) - pulled out of the Profile
// page's tabs so it has its own sidebar entry and is easier to find.
export default function CompanyProfilePage() {
  const { user } = useAuth()

  return (
    <div className="flex h-screen overflow-hidden bg-neutral-50">
      <Sidebar user={user} />

      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="shrink-0 border-b border-neutral-100 bg-white px-10 py-5">
          <h1 className="text-3xl font-extrabold tracking-tight text-neutral-800">
            Company Profile
          </h1>
          <p className="mt-1 text-sm text-neutral-400">
            Manage your company&apos;s branding and contact details
          </p>
        </header>

        <section className="min-h-0 flex-1 overflow-hidden p-5">
          {user?.comp_id && <CompanyProfileForm compId={user.comp_id} />}
        </section>
      </main>
    </div>
  )
}
