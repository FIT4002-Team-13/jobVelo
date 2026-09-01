import { Component } from 'react'
import { useNavigate } from 'react-router-dom'
import { Compass, Lock, TriangleAlert } from 'lucide-react'
import { useAuth } from '../lib/AuthContext.jsx'

// One error screen for every "you can't be here" state, keyed by code:
//
//   404 - route doesn't exist (App's catch-all "*" route)
//   403 - signed in but not allowed (RequireRole renders this instead of
//         silently bouncing, so users understand WHY they moved)
//   500 - something crashed (AppErrorBoundary below renders this when a
//         component throws during render, instead of a white screen)
//
// All variants share the same anatomy as the rest of the app: big faded
// status code, tinted icon square, short title + explanation, and actions
// that always give the user a way out.
const VARIANTS = {
  404: {
    icon: <Compass size={28} className="text-primary-500" />,
    iconTint: 'bg-primary-100',
    title: 'Page not found',
    message:
      "The page you're looking for doesn't exist or may have been moved. Check the address, or head back to somewhere familiar.",
  },
  403: {
    icon: <Lock size={28} className="text-coral-500" />,
    iconTint: 'bg-coral-100',
    title: 'Access restricted',
    message:
      "You don't have permission to view this page. If you think you should, ask your company admin to check your role.",
  },
  500: {
    icon: <TriangleAlert size={28} className="text-coral-500" />,
    iconTint: 'bg-coral-100',
    title: 'Something went wrong',
    message:
      'An unexpected error occurred while rendering this page. Reloading usually fixes it - if it keeps happening, let your team know.',
  },
}

export default function ErrorPage({ code = 404 }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const v = VARIANTS[code] ?? VARIANTS[404]
  const homePath = user ? '/dashboard' : '/'
  const homeLabel = user ? 'Go to Dashboard' : 'Go home'

  return (
    <div className="grid min-h-screen place-items-center bg-neutral-50 px-6">
      <div className="flex max-w-md flex-col items-center text-center">
        {/* Oversized faded code anchors the page without shouting. */}
        <p className="select-none text-[96px] font-extrabold leading-none tracking-tight text-neutral-200">
          {code}
        </p>
        <div
          className={`-mt-6 flex h-14 w-14 items-center justify-center rounded-2xl border-4 border-neutral-50 ${v.iconTint}`}
        >
          {v.icon}
        </div>
        <h1 className="mt-5 text-2xl font-extrabold tracking-tight text-neutral-800">
          {v.title}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-neutral-500">{v.message}</p>

        <div className="mt-7 flex items-center gap-3">
          {code === 500 ? (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-xl bg-primary-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-600"
            >
              Reload page
            </button>
          ) : (
            <button
              type="button"
              onClick={() => navigate(homePath)}
              className="rounded-xl bg-primary-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-600"
            >
              {homeLabel}
            </button>
          )}
          <button
            type="button"
            // On 500 the AppErrorBoundary is still in hasError:true, so a
            // client-side navigate() leaves it rendering the error page.
            // window.location.assign forces a full navigation which resets
            // the boundary. 404/403 don't have that problem.
            onClick={() => {
              if (code === 500) {
                window.location.assign(homePath)
              } else {
                navigate(-1)
              }
            }}
            className="rounded-xl border border-neutral-200 bg-white px-5 py-2.5 text-sm font-semibold text-neutral-600 transition-colors hover:bg-neutral-50"
          >
            {code === 500 ? homeLabel : 'Go back'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Catches render-time crashes anywhere under it and shows the 500 variant
// instead of React's blank white screen. Must be a class component - error
// boundaries have no hook equivalent.
export class AppErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    // Surface the real stack in the console for debugging - the UI only
    // shows the friendly screen.
    console.error('Unhandled render error:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return <ErrorPage code={500} />
    }
    return this.props.children
  }
}
