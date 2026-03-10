import React from 'react'
import { Routes, Route } from 'react-router-dom'
import Navbar  from './components/Navbar'
import Home    from './pages/Home'
import Analyze from './pages/Analyze'
import Results from './pages/Results'
import History from './pages/History'
import Osint   from './pages/Osint'
import Compare from './pages/Compare'
import Alerts  from './pages/Alerts'

export default function App() {
  return (
    <div style={{ minHeight:'100vh', position:'relative' }}>
      <div className="grid-bg"/>
      <Navbar/>
      <main style={{ position:'relative', zIndex:1 }}>
        <Routes>
          <Route path="/"            element={<Home/>}    />
          <Route path="/analyze"     element={<Analyze/>} />
          <Route path="/results/:id" element={<Results/>} />
          <Route path="/history"     element={<History/>} />
          <Route path="/osint"       element={<Osint/>}   />
          <Route path="/compare"     element={<Compare/>} />
          <Route path="/alerts"      element={<Alerts/>}  />
        </Routes>
      </main>
    </div>
  )
}
