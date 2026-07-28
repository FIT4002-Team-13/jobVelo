import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

export default function AuthField({
  label,
  type = 'text',
  placeholder,
  name,
  value,
  onChange,
  autoComplete,
  required,
}) {
  const isPassword = type === 'password'
  const [show, setShow] = useState(false)
  const inputType = isPassword ? (show ? 'text' : 'password') : type

  return (
    <label className="block">
      <span className="block text-sm font-semibold text-neutral-700 mb-1.5">{label}</span>
      <div className="relative">
        <input
          type={inputType}
          name={name}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-base text-ink
                     placeholder:text-neutral-400 outline-none transition-all
                     focus:border-primary-400 focus:ring-4 focus:ring-primary-100"
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
            aria-label={show ? 'Hide password' : 'Show password'}
          >
            {show ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
      </div>
    </label>
  )
}
