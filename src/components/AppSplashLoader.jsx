import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import ChromaVideoLoader from './ChromaVideoLoader';
import { Loader2 } from 'lucide-react';

/**
 * AppSplashLoader
 * Displays a splash screen with chroma video integration.
 */
export default function AppSplashLoader({
  videoSrc = '/loading.mp4',
  onFinished = null,
  message = 'Cargando recursos del Estudio Contable...',
  minDurationMs = 2200,
}) {
  const [showSplash, setShowSplash] = useState(true);
  const [progress, setProgress] = useState(10);

  useEffect(() => {
    // Progress bar simulation
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 95) {
          clearInterval(interval);
          return 95;
        }
        return prev + Math.floor(Math.random() * 15 + 5);
      });
    }, 200);

    // Minimum splash duration for smooth animation display
    const timer = setTimeout(() => {
      setProgress(100);
      setTimeout(() => {
        setShowSplash(false);
        if (onFinished) onFinished();
      }, 400);
    }, minDurationMs);

    return () => {
      clearInterval(interval);
      clearTimeout(timer);
    };
  }, [minDurationMs, onFinished]);

  if (!showSplash) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="splash-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.4 }}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--bg-main)',
          color: 'var(--text-main)',
          padding: '24px',
          backdropFilter: 'blur(10px)',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            maxWidth: '380px',
            width: '100%',
            textAlign: 'center',
            gap: '16px',
          }}
        >
          {/* Chroma Key Video Loader with Green Screen Removal */}
          <div
            style={{
              position: 'relative',
              width: '280px',
              height: '210px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 'var(--radius-lg)',
              overflow: 'hidden',
              background: 'radial-gradient(circle, var(--bg-card-hover) 0%, transparent 70%)',
            }}
          >
            <ChromaVideoLoader
              src={videoSrc}
              width={320}
              height={240}
              sensitivity={0.32}
              smoothness={0.18}
              autoPlay
              loop
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
              MJ Estudio Contable
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
              {message}
            </p>
          </div>

          {/* Progress bar */}
          <div style={{ width: '100%', marginTop: '8px' }}>
            <div
              style={{
                width: '100%',
                height: '6px',
                backgroundColor: 'var(--border-color)',
                borderRadius: '10px',
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              <motion.div
                style={{
                  height: '100%',
                  backgroundColor: 'var(--primary)',
                  borderRadius: '10px',
                }}
                initial={{ width: '0%' }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              />
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '11px',
                color: 'var(--text-muted)',
                marginTop: '6px',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Loader2 size={12} className="animate-spin" /> Cargando sistema...
              </span>
              <strong style={{ color: 'var(--primary)' }}>{progress}%</strong>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
