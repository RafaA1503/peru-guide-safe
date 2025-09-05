
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
  type: 'obstacle' | 'currency' | 'general';
  severity: 'safe' | 'warning' | 'danger';
  message: string;
  confidence: number;
}

const VisionAssistant = () => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [isRealTimeActive, setIsRealTimeActive] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const { isAndroid, isMobile, isNative } = usePlatform();

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

  // Text-to-speech function
  const speak = useCallback((text: string) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'es-ES';
      utterance.rate = 0.9;
      utterance.pitch = 1;
      speechSynthesis.speak(utterance);
    }
  }, []);

  // Stop real-time analysis
  const stopRealTimeAnalysis = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsRealTimeActive(false);
  }, []);

  // Initialize camera with native permission handling
  const startCamera = useCallback(async () => {
    console.log('Intentando iniciar cámara...');
    console.log('Plataforma:', { isAndroid, isMobile, isNative: Capacitor.isNativePlatform() });
    
    try {
      // Request permissions first on native platforms
      if (Capacitor.isNativePlatform()) {
        console.log('Solicitando permisos de cámara en plataforma nativa...');
        
        // For Android, request camera permission
        if (isAndroid) {
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
                throw new Error('Permisos de cámara denegados');
              }
            }
          } catch (permError) {
            console.error('Error con permisos de Capacitor Camera:', permError);
            // Continue with getUserMedia as fallback
          }
        }
      }
      
      // Standard web camera access
      console.log('Accediendo a getUserMedia...');
      const constraints = {
        video: { 
          facingMode: 'environment',
          width: { ideal: 1280, min: 640 },
          height: { ideal: 720, min: 480 }
        }
      };
      
      console.log('Constraints:', constraints);
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('Stream obtenido:', stream);
      
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          streamRef.current = stream;
          setCameraActive(true);
          console.log('Cámara configurada exitosamente');
        }
      
      speak("Cámara activada. Iniciando detección automática.");
      
      // Auto-start real-time analysis immediately
      setTimeout(() => {
        startRealTimeAnalysis();
      }, 1000);
      
    } catch (error) {
      console.error('Error completo al acceder a cámara:', error);
      console.error('Error name:', error.name);
      console.error('Error message:', error.message);
      
      let errorMessage = 'No se pudo acceder a la cámara';
      
      if (error.name === 'NotAllowedError') {
        errorMessage = 'Permisos de cámara denegados. Habilite los permisos en configuración.';
      } else if (error.name === 'NotFoundError') {
        errorMessage = 'No se encontró ninguna cámara en el dispositivo.';
      } else if (error.name === 'NotSupportedError') {
        errorMessage = 'Cámara no soportada en este navegador.';
      }
      
      toast.error(errorMessage);
      speak(errorMessage);
    }
  }, [isAndroid, speak]);

  // Handle camera activation based on platform
  const handleCameraActivation = useCallback(() => {
    console.log('handleCameraActivation - Plataforma:', { isAndroid, isNative });
    startCamera();
  }, [startCamera]);

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
    if (!videoRef.current || !canvasRef.current || !cameraActive) {
      toast.error('Cámara no disponible');
      return;
    }

    setIsAnalyzing(true);
    
    try {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      const context = canvas.getContext('2d')!;
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0);
      
      const imageData = canvas.toDataURL('image/jpeg', 0.8);
      
      const result = await analyzeImage(imageData);
      
      setAnalysisResult(result);
      speak(result.message);
      
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

  // Start real-time analysis
  const startRealTimeAnalysis = useCallback(() => {
    if (intervalRef.current || !cameraActive) return;
    
    setIsRealTimeActive(true);
    speak("Análisis en tiempo real activado");
    
    intervalRef.current = setInterval(() => {
      if (!isAnalyzing) {
        captureAndAnalyze();
      }
    }, 5000);
  }, [captureAndAnalyze, isAnalyzing, speak, cameraActive]);

  // Real OpenAI Vision API analysis
  const analyzeImage = async (imageData: string): Promise<AnalysisResult> => {
    try {
      const { data, error } = await supabase.functions.invoke('analyze-image', {
        body: {
          imageData,
        },
      });

      if (error) {
        throw error;
      }

      // Ensure we have a proper AnalysisResult object and normalize message
      let result: any = data;
      
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

      if (result && typeof result.message === 'string') {
        const raw = result.message as string;
        const cleaned = raw.replace(/```json/i, '').replace(/```/g, '').trim();
        try {
          const maybe = JSON.parse(cleaned);
          if (maybe && typeof maybe.message === 'string') {
            result = { ...result, ...maybe, message: maybe.message };
          } else {
            result.message = cleaned;
          }
        } catch {
          result.message = cleaned;
        }
      }

      return result as AnalysisResult;
    } catch (error) {
      console.error('Error calling analysis API:', error);
      return {
        type: 'general',
        severity: 'warning',
        message: 'Error al conectar con el servicio de análisis. Verifique su conexión.',
        confidence: 0.0,
      };
    }
  };

  useEffect(() => {
    console.log('VisionAssistant montado');
    console.log('Plataforma detectada:', { isAndroid, isMobile, isNative });
    console.log('Es plataforma nativa:', Capacitor.isNativePlatform());
    
    // Auto-start camera and detection on component mount
    const initializeCamera = () => {
      console.log('Inicializando cámara...');
      console.log('Iniciando cámara directamente');
      startCamera();
    };

    // Start camera automatically immediately
    const timer = setTimeout(initializeCamera, 1000);
    
    return () => {
      clearTimeout(timer);
      console.log('Limpiando VisionAssistant...');
      stopCamera();
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isAndroid, isNative, startCamera, stopCamera]);

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
          <h1 className="text-2xl lg:text-4xl font-bold text-foreground">
            Asistente Visual Unificado
          </h1>
          <p className="text-base lg:text-xl text-muted-foreground">
            Detecta billetes y obstáculos automáticamente
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
                <div className="text-white text-center p-4">
                  <Camera className="w-12 h-12 lg:w-16 lg:h-16 mx-auto mb-4 opacity-50" />
                  <p className="text-base lg:text-lg mb-4">Iniciando cámara automáticamente...</p>
                  <div className="animate-spin rounded-full h-8 w-8 lg:h-12 lg:w-12 border-b-2 border-white mx-auto"></div>
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
        <div className="text-center mb-4 lg:mb-6">
          <div className={`inline-flex items-center gap-2 px-3 lg:px-4 py-2 rounded-full text-sm lg:text-base ${
            isRealTimeActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
          }`}>
            <div className={`w-2 h-2 lg:w-3 lg:h-3 rounded-full ${
              isRealTimeActive ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
            }`}></div>
            <span className="font-medium">
              {isRealTimeActive ? 'Análisis en Tiempo Real Activo' : 'Análisis en Tiempo Real Inactivo'}
            </span>
          </div>
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
    </div>
  );
};

export default VisionAssistant;
