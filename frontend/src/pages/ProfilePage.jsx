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

        {/* To be refined in US34. Currently uses hardcoded data and comment function does not work. */}
        <div className="bg-white border rounded-xl p-5 col-span-3 row-span-3 ">
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
        <div className="bg-white border rounded-xl p-5 col-span-3 row-span-4 ">
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

      </main>
    </div>
  );
}