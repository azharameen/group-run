import { Routes, Route, Navigate, Link } from 'react-router-dom'
import { Lightbulb, BarChart3, Database, Shield } from 'lucide-react'
import Dashboard from './pages/Dashboard'
import IdeaDetail from './pages/IdeaDetail'
import KnowledgeBase from './pages/KnowledgeBase'
import SiemensControls from './pages/SiemensControls'

function NavItem({ to, icon: Icon, children }: { to: string; icon: any; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium text-gray-600 hover:text-siemens-green hover:bg-siemens-light transition-colors"
    >
      <Icon className="w-4 h-4" />
      {children}
    </Link>
  )
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-1">
              <Link to="/" className="flex items-center gap-2 mr-6">
                <Lightbulb className="w-5 h-5 text-siemens-green" />
                <span className="font-semibold text-gray-900">Patent Ideator</span>
              </Link>
              <NavItem to="/" icon={BarChart3}>Dashboard</NavItem>
              <NavItem to="/knowledge-base" icon={Database}>Knowledge Base</NavItem>
              <NavItem to="/siemens-controls" icon={Shield}>Siemens Controls</NavItem>
            </div>
            <div className="text-xs text-gray-400">Siemens Patent Pipeline</div>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>
    </div>
  )
}

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/ideas/:ideaId" element={<IdeaDetail />} />
        <Route path="/knowledge-base" element={<KnowledgeBase />} />
        <Route path="/siemens-controls" element={<SiemensControls />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}
