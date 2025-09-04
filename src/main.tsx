import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './index.css'
import HostScreen from './components/HostScreen.tsx'
import JoinScreen from './components/JoinScreen.tsx'

const router = createBrowserRouter([
  {
    path: "/host",
    element: <HostScreen />,
  },
  {
    path: "/join",
    element: <JoinScreen />,
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
