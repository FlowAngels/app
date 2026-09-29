import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import './index.css'
import SplashScreen from './components/SplashScreen.tsx'
import Lobby from './components/Lobby.tsx'
import Join from './mobile/Join.tsx'
import PlaytestDemo from './demo/PlaytestDemo.tsx'

const router = createBrowserRouter([
  {
    path: "/",
    element: <SplashScreen />,
  },
  {
    path: "/lobby",
    element: <Lobby />,
  },
  {
    path: "/host",
    element: <Navigate to="/lobby" replace />,
  },
  {
    path: "/join",
    element: <Join />,
  },
  ...((import.meta.env.DEV || import.meta.env.VITE_ENABLE_PLAYTEST_DEMO === 'true') ? [{
    path: "/demo",
    element: <PlaytestDemo />,
  }] : []),
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
