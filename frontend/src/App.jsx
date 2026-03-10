import React from 'react'
import { Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import Home    from './pages/Home'
import Analyze from './pages/Analyze'
import Results from './pages/Results'
import History from './pages/History'
import Osint   from './pages/Osint'

export default function App() {
  return (
    <div style={{ minHeight:'100vh', position:'relative' }}>
      <div className="grid-bg"/>
      <Navbar/>
      <main style={{ maxWidth:1280, margin:'0 auto', padding:'0 24px 80px', position:'relative', zIndex:1 }}>
        <Routes>
          <Route path="/"            element={<Home/>}    />
          <Route path="/analyze"     element={<Analyze/>} />
          <Route path="/results/:id" element={<Results/>} />
          <Route path="/history"     element={<History/>} />
          <Route path="/osint"       element={<Osint/>}   />
        </Routes>
      </main>
    </div>
  )
}
