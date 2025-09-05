import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import './index.css'
import SplashScreen from './components/SplashScreen.tsx'
import Lobby from './components/Lobby.tsx'
import Join from './mobile/Join.tsx'

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
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
