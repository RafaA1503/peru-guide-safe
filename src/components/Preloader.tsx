import React, { useState, useEffect } from 'react';
import { Eye, Zap, Shield } from 'lucide-react';

interface PreloaderProps {
  onComplete: () => void;
}

const Preloader: React.FC<PreloaderProps> = ({ onComplete }) => {
  const [progress, setProgress] = useState(0);
  const [currentIcon, setCurrentIcon] = useState(0);

  const icons = [Eye, Zap, Shield];
  const features = [
    "Activando visión artificial...",
    "Configurando detección automática...",
    "Iniciando navegación segura..."
  ];

  useEffect(() => {
    const duration = 5000; // 5 segundos
    const interval = 50; // Actualizar cada 50ms
    const steps = duration / interval;
    const progressIncrement = 100 / steps;

    const timer = setInterval(() => {
      setProgress(prev => {
        const newProgress = prev + progressIncrement;
        
        // Cambiar icono y mensaje cada 33% del progreso
        const iconIndex = Math.floor((newProgress / 100) * 3);
        setCurrentIcon(Math.min(iconIndex, 2));
        
        if (newProgress >= 100) {
          clearInterval(timer);
          setTimeout(onComplete, 200); // Pequeña pausa antes de completar
          return 100;
        }
        return newProgress;
      });
    }, interval);

    return () => clearInterval(timer);
  }, [onComplete]);

  const CurrentIcon = icons[currentIcon];

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-primary/10 via-background to-secondary/10 flex items-center justify-center z-50">
      <div className="text-center space-y-8 max-w-md mx-auto px-6">
        {/* Logo y nombre */}
        <div className="space-y-4">
          <div className="relative">
            <div className="w-24 h-24 mx-auto bg-gradient-to-r from-primary to-primary/80 rounded-full flex items-center justify-center shadow-2xl">
              <CurrentIcon className="w-12 h-12 text-primary-foreground animate-pulse" />
            </div>
            <div className="absolute inset-0 w-24 h-24 mx-auto bg-gradient-to-r from-primary to-primary/80 rounded-full animate-ping opacity-20"></div>
          </div>
          
          <h1 className="text-5xl font-bold bg-gradient-to-r from-primary via-primary/80 to-secondary bg-clip-text text-transparent">
            aelo
          </h1>
          <p className="text-lg text-muted-foreground font-medium">
            Asistente Visual Inteligente
          </p>
        </div>

        {/* Mensaje de carga */}
        <div className="space-y-4">
          <p className="text-base text-foreground/80 animate-fade-in">
            {features[currentIcon]}
          </p>
          
          {/* Barra de progreso */}
          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-primary to-secondary rounded-full transition-all duration-100 ease-out"
              style={{ width: `${progress}%` }}
            >
              <div className="h-full bg-gradient-to-r from-transparent to-white/20 rounded-full animate-pulse"></div>
            </div>
          </div>
          
          {/* Porcentaje */}
          <p className="text-sm text-muted-foreground font-mono">
            {Math.round(progress)}%
          </p>
        </div>

        {/* Puntos de carga */}
        <div className="flex justify-center space-x-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`w-3 h-3 rounded-full transition-all duration-300 ${
                i <= currentIcon 
                  ? 'bg-primary scale-125' 
                  : 'bg-muted scale-100'
              }`}
              style={{
                animationDelay: `${i * 0.2}s`,
                animation: i <= currentIcon ? 'bounce 1s infinite' : 'none'
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default Preloader;