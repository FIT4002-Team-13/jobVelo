import Navbar from '../components/landing/Navbar.jsx'
import Hero from '../components/landing/Hero.jsx'
import DashboardSection from '../components/landing/DashboardSection.jsx'
import DefineRoleSection from '../components/landing/DefineRoleSection.jsx'
import FeaturesSection from '../components/landing/FeaturesSection.jsx'
import HowItWorksSection from '../components/landing/HowItWorksSection.jsx'
import Footer from '../components/landing/Footer.jsx'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-bg text-ink">
      <Navbar />
      <main>
        <Hero />
        <DashboardSection />
        <DefineRoleSection />
        <FeaturesSection />
        <HowItWorksSection />
      </main>
      <Footer />
    </div>
  )
}
