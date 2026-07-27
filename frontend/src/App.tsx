import { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/app-sidebar'
import { SiteHeader } from '@/components/site-header'
import Dashboard from './pages/Dashboard'
import IdeaDetail from './pages/IdeaDetail'
import KnowledgeBase from './pages/KnowledgeBase'
import SiemensControls from './pages/SiemensControls'

export default function App() {
  const [currentIdeaTitle, setCurrentIdeaTitle] = useState<string | undefined>()

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <SiteHeader ideaTitle={currentIdeaTitle} />
        <main className="flex-1 space-y-4 p-6 md:p-8 pt-6 max-w-7xl w-full mx-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route 
              path="/ideas/:ideaId" 
              element={<IdeaDetail onIdeaLoaded={(title) => setCurrentIdeaTitle(title)} />} 
            />
            <Route path="/knowledge-base" element={<KnowledgeBase />} />
            <Route path="/siemens-controls" element={<SiemensControls />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
