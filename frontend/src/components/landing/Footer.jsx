import Logo from '../common/Logo.jsx'

const cols = [
  { title: 'Product',  items: ['Features', 'Integrations'] },
  { title: 'Resources', items: ['Help center', 'API docs', 'Status'] },
  { title: 'Legal',    items: ['Privacy', 'Terms', 'Security', 'Cookies'] },
]

export default function Footer() {
  return (
    <footer className="border-t border-neutral-100 bg-white">
      <div className="container-page py-16 grid lg:grid-cols-[1.5fr_repeat(4,1fr)] gap-10">
        <div>
          <Logo />
          <p className="mt-4 text-sm text-neutral-600 max-w-xs">
            Smart Recruit. Better hires. Instantly. Built with care for hiring teams everywhere.
          </p>
        </div>
        {cols.map((c) => (
          <div key={c.title}>
            <div className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-3">{c.title}</div>
            <ul className="space-y-2">
              {c.items.map((i) => (
                <li key={i}>
                  <a href="#" className="text-sm text-neutral-700 hover:text-primary-600">{i}</a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-neutral-100">
        <div className="container-page py-5 flex flex-col sm:flex-row justify-between items-center gap-3">
          <span className="text-xs text-neutral-500">© {new Date().getFullYear()} Smart Recruit. All rights reserved.</span>
          <span className="text-xs text-neutral-500">Designed and built with care for hiring teams</span>
        </div>
      </div>
    </footer>
  )
}
