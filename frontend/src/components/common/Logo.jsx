import logoFinal from '../../assets/logo-final.png'

export default function Logo({ className = '', imgClassName = 'h-16 w-auto md:h-16' }) {
  return (
    <div className={`flex items-center ${className}`}>
      <img src={logoFinal} alt="Smart Recruit" className={imgClassName} />
    </div>
  )
}
