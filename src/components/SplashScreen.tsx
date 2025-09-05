import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { createRoom } from '../lib/orchestrator'

export default function SplashScreen() {
  const navigate = useNavigate()
  const [canResume, setCanResume] = useState(false)
  const [latestRoomId, setLatestRoomId] = useState<string | null>(null)

  useEffect(() => {
    const init = async () => {
      // Stable host device id
      let hostDeviceId = localStorage.getItem('hostDeviceId')
      if (!hostDeviceId) {
        hostDeviceId = 'host-' + Math.random().toString(36).slice(2, 11)
        localStorage.setItem('hostDeviceId', hostDeviceId)
      }

      // If a current room is cached, allow resume immediately
      const cached = localStorage.getItem('currentRoomId')
      if (cached) {
        setCanResume(true)
        setLatestRoomId(cached)
        return
      }

      // Otherwise, look up recent rooms for this device (not ended, <30m old)
      const { data, error } = await supabase
        .from('rooms')
        .select('id,status,created_at')
        .eq('host_device_id', hostDeviceId)
        .neq('status', 'ended')
        .order('created_at', { ascending: false })
        .limit(5)
      if (error) return
      const now = Date.now()
      const fresh = (data || []).filter(r => (now - new Date(r.created_at).getTime()) < 30 * 60 * 1000)
      if (fresh.length > 0) {
        setCanResume(true)
        setLatestRoomId(fresh[0].id)
      }
    }
    init()
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden" style={{
      background: 'radial-gradient(ellipse at center, #0f172a 0%, #1e293b 30%, #0f172a 70%, #000 100%)',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      
      {/* 3D Textured Characters */}
      <div className="absolute" style={{
        top: '8%',
        left: '12%',
        fontSize: '8rem',
        transform: 'rotate(-15deg)',
        filter: 'drop-shadow(8px 8px 16px rgba(0,0,0,0.7))'
      }}>
        <div style={{
          background: 'conic-gradient(from 45deg, #64748b, #94a3b8, #64748b, #475569)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          textShadow: '4px 4px 8px rgba(0,0,0,0.5)'
        }}>
          🎭
        </div>
      </div>

      <div className="absolute" style={{
        top: '15%',
        right: '8%',
        fontSize: '10rem',
        transform: 'rotate(20deg)',
        filter: 'drop-shadow(12px 12px 24px rgba(0,0,0,0.8))'
      }}>
        <div style={{
          background: 'conic-gradient(from 0deg, #fbbf24, #f59e0b, #d97706, #fbbf24)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          textShadow: '6px 6px 12px rgba(0,0,0,0.6)'
        }}>
          ⭐
        </div>
      </div>

      <div className="absolute" style={{
        bottom: '20%',
        left: '8%',
        fontSize: '9rem',
        transform: 'rotate(-25deg)',
        filter: 'drop-shadow(10px 10px 20px rgba(0,0,0,0.7))'
      }}>
        <div style={{
          background: 'conic-gradient(from 90deg, #3b82f6, #1d4ed8, #1e40af, #3b82f6)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          textShadow: '5px 5px 10px rgba(0,0,0,0.5)'
        }}>
          😵
        </div>
      </div>

      <div className="absolute" style={{
        bottom: '12%',
        right: '15%',
        fontSize: '11rem',
        transform: 'rotate(30deg)',
        filter: 'drop-shadow(14px 14px 28px rgba(0,0,0,0.8))'
      }}>
        <div style={{
          background: 'conic-gradient(from 180deg, #a855f7, #7c3aed, #6d28d9, #a855f7)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          textShadow: '7px 7px 14px rgba(0,0,0,0.6)'
        }}>
          🎪
        </div>
      </div>

      <div className="absolute" style={{
        top: '45%',
        left: '5%',
        fontSize: '7rem',
        transform: 'rotate(-35deg)',
        filter: 'drop-shadow(6px 6px 12px rgba(0,0,0,0.6))'
      }}>
        <div style={{
          background: 'conic-gradient(from 270deg, #fbbf24, #f59e0b, #eab308, #fbbf24)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          textShadow: '3px 3px 6px rgba(0,0,0,0.4)'
        }}>
          ⭐
        </div>
      </div>

      {/* Main Content */}
      <div className="text-center relative z-10 px-8" style={{maxWidth: '80rem'}}>
        
        {/* WHATEVER! Title */}
        <h1 style={{
          fontSize: '8.5rem',
          fontWeight: '900',
          letterSpacing: '0.05em',
          marginBottom: '2rem',
          lineHeight: '1',
          position: 'relative'
        }}>
          {/* WHAT - Neon tube style */}
          <span style={{
            color: 'transparent',
            WebkitTextStroke: '3px #00f5ff',
            textShadow: `
              0 0 10px #00f5ff,
              0 0 20px #00f5ff,
              0 0 30px #00f5ff,
              0 0 40px #00f5ff,
              0 0 70px #00f5ff,
              0 0 80px #00f5ff,
              0 0 100px #00f5ff,
              inset 0 0 10px #00f5ff
            `,
            filter: 'drop-shadow(0 0 20px #00f5ff)'
          }}>WHAT</span>
          
          {/* EVER! - Neon tube style */}
          <span style={{
            color: 'transparent',
            WebkitTextStroke: '3px #ff1493',
            textShadow: `
              0 0 10px #ff1493,
              0 0 20px #ff1493,
              0 0 30px #ff1493,
              0 0 40px #ff1493,
              0 0 70px #ff1493,
              0 0 80px #ff1493,
              0 0 100px #ff1493,
              inset 0 0 10px #ff1493
            `,
            filter: 'drop-shadow(0 0 20px #ff1493)'
          }}>EVER!</span>
        </h1>
        
        {/* Add CSS for neon tube animation */}
        <style>{`
          @keyframes neonFlicker {
            0%, 18%, 22%, 25%, 53%, 57%, 100% {
              text-shadow: 
                0 0 10px currentColor,
                0 0 20px currentColor,
                0 0 30px currentColor,
                0 0 40px currentColor,
                0 0 70px currentColor,
                0 0 80px currentColor,
                0 0 100px currentColor;
            }
            20%, 24%, 55% {
              text-shadow: 
                0 0 5px currentColor,
                0 0 10px currentColor,
                0 0 15px currentColor,
                0 0 20px currentColor,
                0 0 35px currentColor,
                0 0 40px currentColor,
                0 0 50px currentColor;
            }
          }
        `}</style>

        {/* Tagline */}
        <p style={{
          fontSize: '2rem',
          color: '#fbbf24',
          marginBottom: '4rem',
          fontWeight: '500',
          textShadow: '0 2px 10px rgba(251, 191, 36, 0.4)'
        }}>
          Say it in 100 characters. Laugh in 1000.
        </p>

        {/* Game Info Badges */}
        <div className="flex justify-center items-center" style={{gap: '2rem', marginBottom: '4rem'}}>
          <div style={{
            background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.15) 0%, rgba(245, 158, 11, 0.25) 100%)',
            border: '2px solid rgba(251, 191, 36, 0.3)',
            borderRadius: '50px',
            padding: '1rem 2rem',
            backdropFilter: 'blur(10px)',
            boxShadow: '0 8px 32px rgba(251, 191, 36, 0.1)'
          }}>
            <span style={{
              color: '#fbbf24',
              fontWeight: '600',
              fontSize: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              🎉 Party
            </span>
          </div>

          <div style={{
            background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.15) 0%, rgba(16, 185, 129, 0.25) 100%)',
            border: '2px solid rgba(34, 197, 94, 0.3)',
            borderRadius: '50px',
            padding: '1rem 2rem',
            backdropFilter: 'blur(10px)',
            boxShadow: '0 8px 32px rgba(34, 197, 94, 0.1)'
          }}>
            <span style={{
              color: '#10b981',
              fontWeight: '600',
              fontSize: '1.25rem'
            }}>
              1–8 players
            </span>
          </div>

          <div style={{
            background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(37, 99, 235, 0.25) 100%)',
            border: '2px solid rgba(59, 130, 246, 0.3)',
            borderRadius: '50px',
            padding: '1rem 2rem',
            backdropFilter: 'blur(10px)',
            boxShadow: '0 8px 32px rgba(59, 130, 246, 0.1)'
          }}>
            <span style={{
              color: '#3b82f6',
              fontWeight: '600',
              fontSize: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              ⏰ 15 min
            </span>
          </div>
        </div>

        {/* Description */}
        <div style={{
          color: '#cbd5e1',
          fontSize: '1.5rem',
          lineHeight: '1.6',
          maxWidth: '42rem',
          margin: '0 auto',
          textShadow: '0 2px 8px rgba(0,0,0,0.6)'
        }}>
          A couch-friendly, phone-controlled party game.<br />
          Submit snappy answers, spot the round owner,<br />
          vote your favorites. Two champions, endless<br />
          laughs.
        </div>

        {/* Primary Actions */}
        <div className="mt-10 flex items-center justify-center gap-4">
          <button
            onClick={async () => {
              // Ensure device id
              let hostDeviceId = localStorage.getItem('hostDeviceId')
              if (!hostDeviceId) {
                hostDeviceId = 'host-' + Math.random().toString(36).slice(2, 11)
                localStorage.setItem('hostDeviceId', hostDeviceId)
              }
              const { id } = await createRoom(hostDeviceId)
              localStorage.setItem('currentRoomId', id)
              navigate(`/lobby?room=${id}&hostJoin=1`)
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg text-xl font-semibold"
          >
            Create Game
          </button>
          {canResume && (
            <button
              onClick={() => {
                if (latestRoomId) {
                  localStorage.setItem('currentRoomId', latestRoomId)
                  navigate(`/lobby?room=${latestRoomId}`)
                } else {
                  navigate('/lobby')
                }
              }}
              className="bg-gray-600 hover:bg-gray-700 text-white px-8 py-3 rounded-lg text-xl font-semibold"
            >
              Resume Room
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
