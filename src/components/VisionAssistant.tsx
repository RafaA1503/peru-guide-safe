
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Camera, Mic, MicOff, Eye, AlertTriangle, DollarSign, Volume2, Play, Square } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import CameraPermissionDialog from './CameraPermissionDialog';

import { usePlatform } from '@/hooks/usePlatform';
import { useVoiceRecognition } from '@/hooks/useVoiceRecognition';
import { Capacitor } from '@capacitor/core';

interface AnalysisResult {
  type: 'obstacle' | 'currency' | 'general' | 'objects';
  severity: 'safe' | 'warning' | 'danger';
  message: string;
  confidence: number;
}

interface MotionDetection {
  isMoving: boolean;
  movementLevel: number;
  lastFrameData: ImageData | null;
}

const VisionAssistant = () => {
  console.log('🚀 VisionAssistant: Componente iniciando...');
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [isRealTimeActive, setIsRealTimeActive] = useState(false);
  const [showPermissionDialog, setShowPermissionDialog] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [motionDetected, setMotionDetected] = useState(false);
  const [analysisQueue, setAnalysisQueue] = useState<number[]>([]);
  const [lastAnalysisResult, setLastAnalysisResult] = useState<AnalysisResult | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const startRealTimeAnalysisRef = useRef<() => void>(() => {});
  const lastFrameRef = useRef<ImageData | null>(null);
  const motionDetectionRef = useRef<NodeJS.Timeout | null>(null);
  const analysisQueueRef = useRef<ImageData[]>([]);
  const lastAnalysisTime = useRef<number>(0);
  const processingAnalysis = useRef<boolean>(false);
  const significantChangeThreshold = useRef<number>(50); // Umbral más alto para cambios significativos

  const { isAndroid, isMobile, isNative } = usePlatform();
  console.log('📱 Platform info:', { isAndroid, isMobile, isNative });

  // Voice commands handler
  const handleVoiceCommand = useCallback((command: string) => {
    console.log('Comando de voz recibido:', command);
    
    if (command.includes('prender') || command.includes('encender') || command.includes('activar')) {
      if (command.includes('cámara') || command.includes('camara')) {
        if (!cameraActive) {
          handleCameraActivation();
          speak("Activando cámara");
        }
      }
    } else if (command.includes('analizar') || command.includes('detectar')) {
      if (cameraActive) {
        captureAndAnalyze();
        speak("Analizando entorno");
      } else {
        speak("Activando cámara para análisis");
        handleCameraActivation();
      }
    }
  }, [cameraActive]);

  const { isListening, startListening, isSupported } = useVoiceRecognition(handleVoiceCommand);

  // Text-to-speech function más natural y conversacional
  const speak = useCallback((text: string, priority: 'high' | 'medium' | 'low' = 'medium') => {
    if ('speechSynthesis' in window) {
      // Cancelar speech anterior si es de prioridad alta
      if (priority === 'high') {
        speechSynthesis.cancel();
      }
      
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'es-ES';
      utterance.rate = 1.0; // Velocidad natural
      utterance.pitch = 1.0;
      utterance.volume = 0.8;
      
      // Hacer más conversacional
      const conversationalText = makeConversational(text);
      utterance.text = conversationalText;
      
      speechSynthesis.speak(utterance);
    }
  }, []);

  // Hacer el texto más conversacional y natural
  const makeConversational = (text: string): string => {
    // Patrones para hacer más natural la comunicación
    if (text.toLowerCase().includes('peligro')) {
      return `¡Cuidado! ${text}. Te recomiendo detenerte un momento.`;
    }
    if (text.toLowerCase().includes('escalón') || text.toLowerCase().includes('obstáculo')) {
      return `Atención, ${text}. Ve con cuidado.`;
    }
    if (text.toLowerCase().includes('despejado') || text.toLowerCase().includes('libre')) {
      return `Perfecto, ${text}. Puedes continuar caminando tranquilo.`;
    }
    if (text.toLowerCase().includes('billete') || text.toLowerCase().includes('dinero')) {
      return `He detectado ${text}. ¿Te ayudo a verificarlo?`;
    }
    if (text.toLowerCase().includes('mesa') || text.toLowerCase().includes('silla') || text.toLowerCase().includes('persona')) {
      return `Veo ${text} en el área. Mantente alerta mientras caminas.`;
    }
    
    return text;
  };

  // Proporcionar orientación en tiempo real como un guía personal
  const provideRealtimeGuidance = (result: AnalysisResult) => {
    // Usar directamente el mensaje de la IA que ya es específico
    if (result.type === 'obstacle') {
      if (result.severity === 'danger') {
        return `¡CUIDADO! ${result.message}. Detente inmediatamente.`;
      } else if (result.severity === 'warning') {
        return `Atención, ${result.message}. Camina con precaución.`;
      }
    } else if (result.type === 'currency') {
      return `${result.message}. Te ayudo a verificarlo.`;
    } else if (result.type === 'objects' || result.type === 'general') {
      // Para análisis de objetos, usar el mensaje específico de la IA
      if (result.message.toLowerCase().includes('veo') ||
          result.message.toLowerCase().includes('detecta') ||
          result.message.toLowerCase().includes('hay')) {
        return `${result.message}. Mantente alerta mientras caminas.`;
      } else if (result.message.toLowerCase().includes('despejado') || 
                 result.message.toLowerCase().includes('libre')) {
        return `${result.message}. Continúa tranquilo.`;
      } else {
        return `${result.message}. Ten cuidado con estos elementos.`;
      }
    }
    
    // Fallback: usar el mensaje tal como viene de la IA
    return result.message;
  };

  // Mensajes positivos para situaciones seguras
  const getPositiveGuidance = (result: AnalysisResult): string => {
    const positiveMessages = [
      'Todo bien por aquí, sigue adelante',
      'El camino está despejado, puedes caminar tranquilo',
      'Área segura, continúa con confianza',
      'Sin obstáculos a la vista, todo perfecto',
      'Camino libre, sigue tu ritmo normal'
    ];
    
    if (result.message.toLowerCase().includes('despejado') || result.message.toLowerCase().includes('libre')) {
      return positiveMessages[Math.floor(Math.random() * positiveMessages.length)];
    }
    
    return result.message;
  };

  // Proporcionar guidance continua sin análisis de IA
  const provideContinuousGuidance = (lastResult: AnalysisResult) => {
    const continuousMessages = [
      "Mantén el ritmo, todo sigue igual que antes",
      "Continúa por el mismo camino, sin cambios",
      "Situación estable, puedes seguir tranquilo",
      "El área se mantiene como la dejamos, adelante"
    ];
    
    const randomMessage = continuousMessages[Math.floor(Math.random() * continuousMessages.length)];
    speak(randomMessage, 'low');
  };

  // Detectar movimiento significativo en tiempo real (más estricto)
  const detectMotion = useCallback((currentFrame: ImageData) => {
    if (!lastFrameRef.current) {
      lastFrameRef.current = currentFrame;
      return false;
    }

    const lastFrame = lastFrameRef.current;
    const threshold = significantChangeThreshold.current; // Umbral más alto
    let totalDiff = 0;
    const sampleStep = 8; // Analizar cada 8vo pixel (menos muestras = más rápido)

    for (let i = 0; i < currentFrame.data.length; i += sampleStep * 4) {
      const rDiff = Math.abs(currentFrame.data[i] - lastFrame.data[i]);
      const gDiff = Math.abs(currentFrame.data[i + 1] - lastFrame.data[i + 1]);
      const bDiff = Math.abs(currentFrame.data[i + 2] - lastFrame.data[i + 2]);
      totalDiff += (rDiff + gDiff + bDiff) / 3;
    }

    const avgDiff = totalDiff / (currentFrame.data.length / (sampleStep * 4));
    const isSignificantChange = avgDiff > threshold;

    // Solo actualizar frame de referencia si hay cambio significativo
    if (isSignificantChange) {
      lastFrameRef.current = currentFrame;
      console.log(`Cambio significativo detectado: ${avgDiff.toFixed(2)}`);
    }

    return isSignificantChange;
  }, []);

  // Capturar frame para detección de movimiento
  const captureFrameForMotion = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    // Verificar que el video esté funcionando
    if (videoRef.current.readyState < 2 || videoRef.current.videoWidth === 0) {
      return;
    }

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const context = canvas.getContext('2d')!;

    // Usar resolución muy baja para detección de movimiento (más rápido)
    canvas.width = 160;
    canvas.height = 120;
    
    try {
      context.drawImage(video, 0, 0, 160, 120);
      const frameData = context.getImageData(0, 0, 160, 120);
      const hasMovement = detectMotion(frameData);

      setMotionDetected(hasMovement);

    if (hasMovement) {
      // ANÁLISIS MÁS FRECUENTE para detectar objetos automáticamente
      const now = Date.now();
      const minIntervalBetweenAnalysis = 5000; // REDUCIDO A 5 segundos para detectar objetos
      
      if (now - lastAnalysisTime.current > minIntervalBetweenAnalysis && !processingAnalysis.current) {
        console.log('Ejecutando análisis automático de objetos...');
        triggerSmartAnalysis();
      } else {
        // Dar feedback sin análisis de IA solo si necesario
        const timeRemaining = Math.ceil((minIntervalBetweenAnalysis - (now - lastAnalysisTime.current)) / 1000);
        console.log(`Movimiento detectado, análisis en ${timeRemaining}s...`);
        
        // Usar resultado previo si existe y ha pasado tiempo suficiente
        if (lastAnalysisResult && now - lastAnalysisTime.current > 3000) {
          const continuousMessage = makeConversational(lastAnalysisResult.message);
          speak(continuousMessage, 'low');
        }
      }
    } else {
      // SIN MOVIMIENTO - análisis periódico para detectar objetos estáticos
      const now = Date.now();
      if (now - lastAnalysisTime.current > 8000) { // 8 segundos sin movimiento, hacer análisis
        console.log('Analizando objetos estáticos en el área...');
        triggerSmartAnalysis();
      }
    }
    } catch (error) {
      console.warn('Error en detección de movimiento:', error);
    }
  }, [detectMotion]);

  // Análisis inteligente solo cuando hay cambios
  const triggerSmartAnalysis = useCallback(async () => {
    console.log('🎯 triggerSmartAnalysis llamado - processingAnalysis:', processingAnalysis.current, 'video disponible?:', !!videoRef.current);
    
    if (processingAnalysis.current || !videoRef.current || !canvasRef.current) {
      console.log('⚠️ Abortando triggerSmartAnalysis - ya procesando o recursos no disponibles');
      return;
    }

    console.log('🚀 Ejecutando análisis inteligente...');
    processingAnalysis.current = true;
    lastAnalysisTime.current = Date.now();

    try {
      await captureAndAnalyze();
    } finally {
      processingAnalysis.current = false;
      console.log('✅ triggerSmartAnalysis completado');
    }
  }, []);

  // Iniciar detección de movimiento en tiempo real
  const startMotionDetection = useCallback(() => {
    console.log('🔍 startMotionDetection llamado - ya existe intervalo?:', !!motionDetectionRef.current);
    
    if (motionDetectionRef.current) {
      console.log('⚠️ Ya existe detección de movimiento, abortando');
      return;
    }

    console.log('🎯 Iniciando detección automática de objetos con IA...');
    speak("Hola, soy tu asistente visual inteligente. Voy a analizar automáticamente los objetos que encuentres y te guiaré de forma segura en tiempo real.", 'high');

    // Detección de movimiento cada 500ms + análisis automático de objetos
    motionDetectionRef.current = setInterval(() => {
      console.log('⏱️ Ejecutando captureFrameForMotion...');
      captureFrameForMotion();
    }, 500);
    
    console.log('✅ Detección de movimiento configurada con intervalo de 500ms');

    // ANÁLISIS INICIAL AUTOMÁTICO después de 2 segundos
    setTimeout(() => {
      console.log('🚀 Iniciando primer análisis automático de objetos...');
      triggerSmartAnalysis();
    }, 2000);
  }, [captureFrameForMotion, speak, triggerSmartAnalysis]);

  // Stop real-time analysis
  const stopRealTimeAnalysis = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (motionDetectionRef.current) {
      clearInterval(motionDetectionRef.current);
      motionDetectionRef.current = null;
    }
    setIsRealTimeActive(false);
    setMotionDetected(false);
    processingAnalysis.current = false;
  }, []);

  // Initialize camera with native permission handling
  const startCamera = useCallback(async () => {
    console.log('Intentando iniciar cámara...');
    console.log('Plataforma:', { isAndroid, isMobile, isNative: Capacitor.isNativePlatform() });
    
    try {
      // Request permissions first on native platforms
      if (Capacitor.isNativePlatform()) {
        console.log('Solicitando permisos de cámara en plataforma nativa...');
        
        const { Camera } = await import('@capacitor/camera');
        try {
          // Check current permission status
          const permissions = await Camera.checkPermissions();
          console.log('Estado de permisos:', permissions);
          
          if (permissions.camera !== 'granted') {
            console.log('Solicitando permisos de cámara...');
            const permissionResult = await Camera.requestPermissions({ permissions: ['camera'] });
            console.log('Resultado de permisos:', permissionResult);
            
            if (permissionResult.camera !== 'granted') {
              throw new Error('Permisos de cámara denegados por el usuario');
            }
          }
        } catch (permError) {
          console.error('Error con permisos de Capacitor Camera:', permError);
          throw permError;
        }
      }
      
      // Standard web camera access
      console.log('Accediendo a getUserMedia...');
      const constraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      } as MediaStreamConstraints;

      console.log('Constraints (intent):', constraints);

      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (primaryErr) {
        console.warn('Fallo al obtener stream con constraints preferidos, reintentando con básicos...', primaryErr);
        try {
          const fallbackConstraints: MediaStreamConstraints = { video: true };
          stream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
          console.log('Stream obtenido con constraints básicos.');
        } catch (fallbackErr) {
          console.error('Fallo también con constraints básicos:', fallbackErr);
          throw fallbackErr;
        }
      }

      console.log('Stream obtenido:', stream);
      
      if (videoRef.current && stream) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setCameraActive(true);
        setShowPermissionDialog(false);
        console.log('Cámara configurada exitosamente');
        try {
          await videoRef.current.play();
        } catch (e) {
          console.warn('No se pudo iniciar reproducción automática del video:', e);
        }
      }
      
      speak("Cámara activada. Tu asistente visual está listo para ayudarte a navegar de forma segura.", 'high');
      
    // Auto-start smart motion detection
    setTimeout(() => {
      startRealTimeAnalysis();
    }, 2000);
      
    } catch (error) {
      console.error('Error completo al acceder a cámara:', error);
      console.error('Error name:', (error as any).name);
      console.error('Error message:', (error as any).message);
      
      let errorMessage = 'No se pudo acceder a la cámara';
      
      if ((error as any).name === 'NotAllowedError' || (error as any).message?.includes('denegados')) {
        errorMessage = 'Permisos de cámara denegados. Por favor, acepte los permisos cuando se los solicite.';
        // En móviles, mostrar el diálogo nuevamente para que puedan intentar otra vez
        if (isMobile) {
          setTimeout(() => {
            setShowPermissionDialog(true);
          }, 2000);
        }
      } else if ((error as any).name === 'NotFoundError') {
        errorMessage = 'No se encontró ninguna cámara en el dispositivo.';
      } else if ((error as any).name === 'NotSupportedError') {
        errorMessage = 'Cámara no soportada en este navegador.';
      }
      
      toast.error(errorMessage);
      speak(errorMessage);
    }
  }, [isAndroid, isMobile, speak]);

  // Handle camera activation based on platform
  const handleCameraActivation = useCallback(() => {
    console.log('🎥 handleCameraActivation llamado - Plataforma:', { isAndroid, isNative, isMobile });
    if (isMobile) {
      console.log('📱 Es móvil - mostrando dialog de permisos');
      setShowPermissionDialog(true);
    } else {
      console.log('💻 Es desktop - iniciando cámara directamente');
      startCamera();
    }
  }, [isMobile, startCamera]);

  // Stop camera
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      setCameraActive(false);
    }
    stopRealTimeAnalysis();
  }, [stopRealTimeAnalysis]);

  // Capture image and analyze
  const captureAndAnalyze = useCallback(async () => {
    console.log('📸 captureAndAnalyze llamado - video disponible?:', !!videoRef.current, 'canvas disponible?:', !!canvasRef.current);
    
    if (!videoRef.current || !canvasRef.current) {
      console.warn('⚠️ Video o canvas no disponible, pero continuando...');
      return;
    }

    // Verificar que el video esté realmente reproduciendo
    if (videoRef.current.readyState < 2) {
      console.warn('⚠️ Video no está listo, esperando... readyState:', videoRef.current.readyState);
      return;
    }

    console.log('✅ Iniciando análisis de imagen...');
    setIsAnalyzing(true);
    
    try {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      const context = canvas.getContext('2d')!;
      
      // Downscale aún más para reducir payload y mejorar velocidad
      const maxW = 320, maxH = 320;
      const vw = video.videoWidth || 1280;
      const vh = video.videoHeight || 720;
      const ratio = Math.min(maxW / vw, maxH / vh);
      const tw = Math.max(1, Math.round(vw * ratio));
      const th = Math.max(1, Math.round(vh * ratio));
      canvas.width = tw;
      canvas.height = th;
      context.drawImage(video, 0, 0, tw, th);
      
      const imageData = canvas.toDataURL('image/jpeg', 0.3);
      
      const result = await analyzeImage(imageData);
      
      setAnalysisResult(result);
      setLastAnalysisResult(result); // Guardar para reutilizar
      
      // Usar el mensaje específico de la IA con orientación natural
      const guidanceMessage = provideRealtimeGuidance(result);
      
      // Si hay peligro, hablar inmediatamente con prioridad alta
      if (result.severity === 'danger') {
        speak(guidanceMessage, 'high');
        toast.error(result.message);
      } else if (result.severity === 'warning') {
        speak(guidanceMessage, 'medium');
        toast.warning(result.message);
      } else {
        // Para situaciones normales, usar el mensaje específico de objetos
        speak(guidanceMessage, 'low');
        toast.success(result.message);
      }
      
      // If rate limited or transient error, pause and resume automatically
      if (
        result.confidence === 0 ||
        /Demasiadas solicitudes|No se pudo analizar|Error al conectar/i.test(result.message)
      ) {
        console.log('Rate limit excedido, pausando análisis automático por 15 segundos...');
        toast.warning('Servicio ocupado, pausando análisis automático temporalmente');
        
        // Usar resultado previo si existe
        if (lastAnalysisResult) {
          speak("Continúa con cuidado, basándome en lo que vi antes: " + lastAnalysisResult.message, 'medium');
        } else {
          speak("Pausa temporal del análisis. Camina con precaución hasta que se reactive", 'medium');
        }
        
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        if (motionDetectionRef.current) {
          clearInterval(motionDetectionRef.current);
          motionDetectionRef.current = null;
        }
        
        setTimeout(() => {
          if (cameraActive) {
            console.log('Reactivando análisis después de pausa por rate limit...');
            startMotionDetection();
          }
        }, 15000); // Pausa de 15 segundos
      }
      
      if (result.severity === 'danger') {
        toast.error(result.message);
      } else if (result.severity === 'warning') {
        toast.warning(result.message);
      } else {
        toast.success(result.message);
      }
      
    } catch (error) {
      console.error('Error analyzing image:', error);
      const errorMessage = "Error al analizar la imagen. Inténtelo nuevamente.";
      toast.error(errorMessage);
      speak(errorMessage);
    } finally {
      setIsAnalyzing(false);
    }
  }, [speak, cameraActive]);

  // Start real-time analysis with smart detection
  const startRealTimeAnalysis = useCallback(() => {
    console.log('🔄 startRealTimeAnalysis llamado - cameraActive:', cameraActive, 'motionDetectionRef:', !!motionDetectionRef.current);
    
    if (motionDetectionRef.current || !cameraActive) {
      console.log('⚠️ Abortando startRealTimeAnalysis - ya en ejecución o cámara inactiva');
      return;
    }
    
    console.log('✅ Iniciando sistema de detección inteligente de objetos...');
    setIsRealTimeActive(true);
    startMotionDetection();
    
    // ANÁLISIS INMEDIATO al activar para detectar objetos presentes
    setTimeout(() => {
      console.log('⏰ Ejecutando análisis inicial para detectar objetos presentes...');
      captureAndAnalyze();
    }, 1000);
  }, [startMotionDetection, cameraActive, captureAndAnalyze]);

  // Mantener una referencia actualizada a la función
  useEffect(() => {
    startRealTimeAnalysisRef.current = startRealTimeAnalysis;
  }, [startRealTimeAnalysis]);

  // Real OpenAI Vision API analysis
  const analyzeImage = async (imageData: string): Promise<AnalysisResult> => {
    try {
      console.log('Enviando imagen para análisis...');
      
      const { data, error } = await supabase.functions.invoke('analyze-image', {
        body: {
          imageData,
        },
      });

      console.log('Respuesta de función edge:', data, error);

      if (error) {
        console.error('Error de función edge:', error);
        throw error;
      }

      // Manejar respuestas especiales del servidor
      if (data.rateLimited) {
        console.log(`Rate limited por servidor, esperando ${data.waitTime}s`);
        
        // Pausar análisis temporalmente y usar respuestas inteligentes
        if (lastAnalysisResult) {
          const continuousMessage = `Basándome en el análisis anterior: ${lastAnalysisResult.message}. Sistema reactivándose en ${data.waitTime} segundos.`;
          speak(continuousMessage, 'medium');
        }
        
        return {
          type: 'general',
          severity: 'safe',
          message: data.message || 'Sistema en pausa temporal',
          confidence: 0.7,
        };
      }

      if (data.fromCache) {
        console.log('Respuesta desde cache del servidor');
      }

      if (data.queueSaturated) {
        console.log('Cola del servidor saturada');
        
        // Usar respuesta anterior si existe
        if (lastAnalysisResult) {
          const intelligentResponse = `La situación se mantiene similar a antes: ${lastAnalysisResult.message}`;
          speak(intelligentResponse, 'low');
          
          return {
            ...lastAnalysisResult,
            message: intelligentResponse,
            confidence: Math.max(0.6, lastAnalysisResult.confidence - 0.1),
          };
        }
      }

      // Ensure we have a proper AnalysisResult object
      let result: AnalysisResult = data;
      
      if (typeof data === 'string') {
        try {
          result = JSON.parse(data);
        } catch {
          result = {
            type: 'general',
            severity: 'warning',
            message: data,
            confidence: 0.7,
          };
        }
      }

      // Validate result structure
      if (!result || typeof result !== 'object') {
        throw new Error('Respuesta inválida del servicio');
      }

      // Ensure all required fields exist
      if (!result.type) result.type = 'general';
      if (!result.severity) result.severity = 'warning';
      if (!result.message) result.message = 'Análisis completado';
      if (!result.confidence || result.confidence < 0.7) result.confidence = 0.8;

      console.log('Resultado final del análisis:', result);
      return result as AnalysisResult;
      
    } catch (error) {
      console.error('Error calling analysis API:', error);
      
      // Si hay resultado previo y error, usar el resultado previo con mensaje actualizado
      if (lastAnalysisResult && error.message && !error.message.includes('quota')) {
        const fallbackMessage = `Manteniendo alerta del análisis anterior: ${lastAnalysisResult.message}`;
        speak(fallbackMessage, 'low');
        
        return {
          ...lastAnalysisResult,
          message: fallbackMessage,
          confidence: Math.max(0.5, lastAnalysisResult.confidence - 0.2),
        };
      }
      
      return {
        type: 'general',
        severity: 'safe',
        message: 'Sistema en modo conservador. Camina con precaución mientras se reactiva.',
        confidence: 0.6,
      };
    }
  };

  useEffect(() => {
    console.log('VisionAssistant montado');
    console.log('Plataforma detectada:', { isAndroid, isMobile, isNative });
    console.log('Es plataforma nativa:', Capacitor.isNativePlatform());
    
    // Auto-start cámara solo en escritorio/navegador.
    // En móviles, esperamos una interacción del usuario para evitar NotAllowedError.
    const initializeCamera = () => {
      console.log('Inicializando cámara...');
      if (!isMobile) {
        console.log('Escritorio/navegador: iniciando cámara automáticamente');
        startCamera();
      } else {
        console.log('Móvil: esperando interacción del usuario para solicitar cámara');
        setShowPermissionDialog(true);
      }
    };

    initializeCamera();
    
    return () => {
      console.log('Limpiando VisionAssistant...');
      stopCamera();
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isAndroid, isNative, isMobile, startCamera, stopCamera]);

  // Auto-start realtime analysis when camera becomes active
  useEffect(() => {
    if (cameraActive && !isRealTimeActive) {
      console.log('Auto-iniciando análisis en tiempo real al activar cámara...');
      startRealTimeAnalysis();
    }
  }, [cameraActive, isRealTimeActive, startRealTimeAnalysis]);

  // Also start when video actually begins playing (extra safety on some browsers)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onPlaying = () => {
      if (cameraActive && !isRealTimeActive) {
        console.log('Video en reproducción, iniciando análisis en tiempo real...');
        startRealTimeAnalysis();
      }
    };
    video.addEventListener('playing', onPlaying);
    return () => {
      video.removeEventListener('playing', onPlaying);
    };
  }, [cameraActive, isRealTimeActive, startRealTimeAnalysis]);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'danger': return 'border-red-500 bg-red-50 text-red-800';
      case 'warning': return 'border-yellow-500 bg-yellow-50 text-yellow-800';
      default: return 'border-green-500 bg-green-50 text-green-800';
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-4 lg:py-6 max-w-6xl">
        {/* Header */}
        <div className="text-center space-y-2 lg:space-y-4 mb-4 lg:mb-6">
          <div className="inline-flex items-center gap-3 mb-2">
            <div className="w-12 h-12 bg-gradient-to-r from-primary to-primary/80 rounded-full flex items-center justify-center">
              <Eye className="w-6 h-6 text-primary-foreground" />
            </div>
            <h1 className="text-3xl lg:text-5xl font-bold bg-gradient-to-r from-primary via-primary/80 to-secondary bg-clip-text text-transparent">
              aelo
            </h1>
          </div>
          <p className="text-base lg:text-xl text-muted-foreground">
            Asistente Visual Inteligente - Detecta obstáculos y billetes automáticamente
          </p>
        </div>

        {/* Camera Status */}
        <div className="text-center mb-4">
          <div className={`inline-flex items-center gap-2 px-3 lg:px-4 py-2 rounded-full text-sm lg:text-base ${
            cameraActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
          }`}>
            <div className={`w-2 h-2 lg:w-3 lg:h-3 rounded-full ${
              cameraActive ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
            }`}></div>
            <span className="font-medium">
              {cameraActive ? 'Cámara Activa' : 'Cámara Inactiva'}
            </span>
          </div>
        </div>

        {/* Camera View */}
        <Card className="p-3 lg:p-6 space-y-4 mb-4 lg:mb-6">
          <div className="relative bg-black rounded-xl overflow-hidden">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-48 sm:h-64 lg:h-80 object-cover"
            />
            <canvas ref={canvasRef} className="hidden" />
            
            {isAnalyzing && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                <div className="text-white text-center">
                  <div className="animate-spin rounded-full h-8 w-8 lg:h-12 lg:w-12 border-b-2 border-white mx-auto mb-2 lg:mb-4"></div>
                  <p className="text-sm lg:text-lg">Analizando imagen...</p>
                </div>
              </div>
            )}

            {!cameraActive && (
              <div className="absolute inset-0 bg-black/80 flex items-center justify-center">
                <div className="text-white text-center p-4 space-y-4">
                  <Camera className="w-12 h-12 lg:w-16 lg:h-16 mx-auto opacity-60" />
                  <p className="text-base lg:text-lg">Necesitamos tu permiso para usar la cámara</p>
                  <Button onClick={handleCameraActivation} className="bg-primary text-primary-foreground hover:bg-primary/90">
                    Activar cámara
                  </Button>
                  <p className="text-xs lg:text-sm opacity-70">Si no ves el prompt, toca el botón para reintentar</p>
                </div>
              </div>
            )}
          </div>

          {/* Analysis Result */}
          {analysisResult && (
            <Card className={`p-3 lg:p-4 border-2 ${getSeverityColor(analysisResult.severity)}`}>
              <div className="flex items-start gap-3">
                {analysisResult.severity === 'danger' && (
                  <AlertTriangle className="w-5 h-5 lg:w-6 lg:h-6 text-red-600 mt-1 flex-shrink-0" />
                )}
                {analysisResult.severity === 'warning' && (
                  <AlertTriangle className="w-5 h-5 lg:w-6 lg:h-6 text-yellow-600 mt-1 flex-shrink-0" />
                )}
                {analysisResult.severity === 'safe' && (
                  <Eye className="w-5 h-5 lg:w-6 lg:h-6 text-green-600 mt-1 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm lg:text-lg font-medium break-words">
                    {analysisResult.message}
                  </p>
                  <p className="text-xs lg:text-sm opacity-75 mt-1">
                    Confianza: {Math.round(analysisResult.confidence * 100)}%
                  </p>
                </div>
                <Button
                  onClick={() => speak(analysisResult.message)}
                  className="bg-primary text-primary-foreground p-2 flex-shrink-0"
                  size="sm"
                >
                  <Volume2 className="w-3 h-3 lg:w-4 lg:h-4" />
                </Button>
              </div>
            </Card>
          )}
        </Card>

        {/* Real-time Analysis Status */}
        <div className="text-center mb-4 lg:mb-6 space-y-2">
          <div className={`inline-flex items-center gap-2 px-3 lg:px-4 py-2 rounded-full text-sm lg:text-base ${
            isRealTimeActive ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'
          }`}>
            <div className={`w-2 h-2 lg:w-3 lg:h-3 rounded-full ${
              isRealTimeActive ? 'bg-blue-500 animate-pulse' : 'bg-gray-400'
            }`}></div>
            <span className="font-medium">
              {isRealTimeActive ? 'Detección Inteligente Activa' : 'Sistema Inactivo'}
            </span>
          </div>
          
          {isRealTimeActive && (
            <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs ${
              motionDetected ? 'bg-orange-100 text-orange-800' : 'bg-green-100 text-green-800'
            }`}>
              <div className={`w-1.5 h-1.5 rounded-full ${
                motionDetected ? 'bg-orange-500 animate-pulse' : 'bg-green-500'
              }`}></div>
              <span>
                {motionDetected ? 'Movimiento detectado' : 'Escena estable'}
              </span>
            </div>
          )}
        </div>

        {/* Control Buttons - Solo comandos de voz */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:gap-4 mb-6">
          <Button
            onClick={startListening}
            disabled={isListening || !isSupported}
            className={`h-16 lg:h-20 flex flex-col items-center justify-center text-xs lg:text-sm ${
              isListening ? 'bg-red-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {isListening ? (
              <MicOff className="w-5 h-5 lg:w-6 lg:h-6 mb-1" />
            ) : (
              <Mic className="w-5 h-5 lg:w-6 lg:h-6 mb-1" />
            )}
            {isListening ? 'Escuchando...' : 'Comando Voz'}
          </Button>

          <Button
            onClick={() => {
              if (analysisResult) {
                speak(analysisResult.message);
              } else {
                speak("No hay mensaje para repetir");
              }
            }}
            className="h-16 lg:h-20 flex flex-col items-center justify-center text-xs lg:text-sm bg-purple-600 hover:bg-purple-700 text-white"
          >
            <Volume2 className="w-5 h-5 lg:w-6 lg:h-6 mb-1" />
            Repetir Mensaje
          </Button>
        </div>

        {/* Instructions */}
        <Card className="p-4 lg:p-6 bg-muted/50">
          <h3 className="text-lg lg:text-xl font-semibold mb-3 lg:mb-4">Instrucciones de Uso</h3>
          <div className="space-y-2 text-sm lg:text-base text-muted-foreground">
            <p>• <strong>Inicio Automático:</strong> La cámara y detección se activan automáticamente al abrir la app</p>
            <p>• <strong>Detección Automática:</strong> Analiza billetes y obstáculos cada 5 segundos sin intervención</p>
            <p>• <strong>Comandos de Voz:</strong> Diga "prender cámara" o "analizar" para controlar por voz</p>
            <p>• <strong>Billetes Peruanos:</strong> Identifica y verifica autenticidad automáticamente</p>
            <p>• <strong>Navegación Segura:</strong> Alerta sobre obstáculos y peligros continuamente</p>
            <p>• <strong>Alertas de Voz:</strong> Recibe notificaciones habladas automáticas de todo lo detectado</p>
          </div>
        </Card>
      </div>

      {/* Camera Permission Dialog */}
      <CameraPermissionDialog
        isOpen={showPermissionDialog}
        onAccept={startCamera}
        onDeny={() => setShowPermissionDialog(false)}
      />
    </div>
  );
};

export default VisionAssistant;
