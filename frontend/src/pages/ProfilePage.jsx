import { useAuth } from "../lib/AuthContext";
import Sidebar from '../components/common/Sidebar'
import { button, modal, page } from '../styles/layout'
import commentIcon from '../assets/icons/comment.png'
import StatDelta from '../components/common/StatDelta';

export default function Profile() {
  const { user } = useAuth();

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
        
        <div className="grid grid-cols-5 grid-rows-2 gap-4 mt-6">

        <div className="bg-white border p-5 rounded-xl col-span-2 row-span-2 ">

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
        </div>

      </main>
    </div>
  );
}