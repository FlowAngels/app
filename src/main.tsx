import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
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
    path: "/host",
    element: <Lobby />,
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
