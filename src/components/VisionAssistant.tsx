
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Camera, Mic, MicOff, Eye, AlertTriangle, DollarSign, Volume2, Play, Square } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import CameraPermissionDialog from './CameraPermissionDialog';
import { usePlatform } from '@/hooks/usePlatform';
import { useVoiceRecognition } from '@/hooks/useVoiceRecognition';

interface AnalysisResult {
  type: 'obstacle' | 'currency' | 'general';
  severity: 'safe' | 'warning' | 'danger';
  message: string;
  confidence: number;
}

const VisionAssistant = () => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [mode, setMode] = useState<'navigation' | 'currency'>('navigation');
  const [isRealTimeActive, setIsRealTimeActive] = useState(false);
  const [showPermissionDialog, setShowPermissionDialog] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const { isAndroid, isMobile } = usePlatform();

  // Voice commands handler
  const handleVoiceCommand = useCallback((command: string) => {
    console.log('Comando de voz recibido:', command);
    
    if (command.includes('prender') || command.includes('encender') || command.includes('activar')) {
      if (command.includes('cámara') || command.includes('camara')) {
        handleCameraActivation();
        speak("Activando cámara");
      }
    } else if (command.includes('analizar') || command.includes('detectar')) {
      if (cameraActive) {
        captureAndAnalyze();
        speak("Analizando entorno");
      } else {
        speak("Primero debe activar la cámara");
      }
    } else if (command.includes('billete') || command.includes('moneda')) {
      setMode('currency');
      speak("Cambiado a modo detección de billetes");
    } else if (command.includes('navegación') || command.includes('obstáculo')) {
      setMode('navigation');
      speak("Cambiado a modo navegación");
    }
  }, [cameraActive]);

  const { isListening, startListening, isSupported } = useVoiceRecognition(handleVoiceCommand);

  // Handle camera activation based on platform
  const handleCameraActivation = useCallback(() => {
    if (isAndroid) {
      setShowPermissionDialog(true);
    } else {
      startCamera();
    }
  }, [isAndroid]);

  // Initialize camera
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } 
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setCameraActive(true);
        setShowPermissionDialog(false);
      }
      
      speak("Cámara activada. Lista para asistir en navegación.");
      
      // Auto-start real-time analysis after 2 seconds
      setTimeout(() => {
        startRealTimeAnalysis();
      }, 2000);
      
    } catch (error) {
      console.error('Error accessing camera:', error);
      toast.error('No se pudo acceder a la cámara');
      speak("Error al acceder a la cámara. Verifique los permisos.");
      setShowPermissionDialog(false);
    }
  }, []);

  // Stop camera
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      setCameraActive(false);
    }
    stopRealTimeAnalysis();
  }, []);

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
      
      const result = await analyzeImage(imageData, mode);
      
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
  }, [mode, speak, cameraActive]);

  // Real OpenAI Vision API analysis
  const analyzeImage = async (imageData: string, analysisMode: string): Promise<AnalysisResult> => {
    try {
      const { data, error } = await supabase.functions.invoke('analyze-image', {
        body: {
          imageData,
          mode: analysisMode,
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
            type: analysisMode === 'currency' ? 'currency' : 'obstacle',
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
        type: analysisMode === 'currency' ? 'currency' : 'obstacle',
        severity: 'warning',
        message: 'Error al conectar con el servicio de análisis. Verifique su conexión.',
        confidence: 0.0,
      };
    }
  };

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

  // Stop real-time analysis
  const stopRealTimeAnalysis = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsRealTimeActive(false);
  }, []);

  useEffect(() => {
    // Auto-start camera on Android after component mounts
    if (isAndroid) {
      setTimeout(() => {
        setShowPermissionDialog(true);
      }, 1000);
    }
    
    return () => {
      stopCamera();
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isAndroid, stopCamera]);

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
            Asistente Visual
          </h1>
          <p className="text-base lg:text-xl text-muted-foreground">
            Tu guía inteligente para navegar con seguridad
          </p>
        </div>

        {/* Mode Toggle */}
        <div className="flex justify-center gap-3 lg:gap-4 mb-4 lg:mb-6">
          <Button
            onClick={() => {
              setMode('navigation');
              speak("Modo navegación activado");
            }}
            className={`flex items-center gap-2 h-10 lg:h-12 px-4 lg:px-6 text-sm lg:text-base ${
              mode === 'navigation' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            }`}
          >
            <Eye className="w-4 h-4 lg:w-6 lg:h-6" />
            <span className="hidden sm:inline">Navegación</span>
          </Button>
          <Button
            onClick={() => {
              setMode('currency');
              speak("Modo detección de billetes activado");
            }}
            className={`flex items-center gap-2 h-10 lg:h-12 px-4 lg:px-6 text-sm lg:text-base ${
              mode === 'currency' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            }`}
          >
            <DollarSign className="w-4 h-4 lg:w-6 lg:h-6" />
            <span className="hidden sm:inline">Billetes</span>
          </Button>
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
                  <p className="text-base lg:text-lg mb-4">Cámara no activada</p>
                  <Button
                    onClick={handleCameraActivation}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground"
                  >
                    <Camera className="w-4 h-4 mr-2" />
                    Activar Cámara
                  </Button>
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

        {/* Control Buttons */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-6">
          <Button
            onClick={cameraActive ? stopCamera : handleCameraActivation}
            className={`h-16 lg:h-20 flex flex-col items-center justify-center text-xs lg:text-sm ${
              cameraActive ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-primary hover:bg-primary/90 text-primary-foreground'
            }`}
          >
            {cameraActive ? <Square className="w-5 h-5 lg:w-6 lg:h-6 mb-1" /> : <Play className="w-5 h-5 lg:w-6 lg:h-6 mb-1" />}
            {cameraActive ? 'Detener' : 'Iniciar'} Cámara
          </Button>

          <Button
            onClick={isRealTimeActive ? stopRealTimeAnalysis : startRealTimeAnalysis}
            disabled={!cameraActive}
            className={`h-16 lg:h-20 flex flex-col items-center justify-center text-xs lg:text-sm ${
              isRealTimeActive ? 'bg-yellow-600 hover:bg-yellow-700 text-white' : 'bg-green-600 hover:bg-green-700 text-white'
            }`}
          >
            <Eye className="w-5 h-5 lg:w-6 lg:h-6 mb-1" />
            {isRealTimeActive ? 'Pausar' : 'Análisis'} Auto
          </Button>

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
            Repetir
          </Button>
        </div>

        {/* Instructions */}
        <Card className="p-4 lg:p-6 bg-muted/50">
          <h3 className="text-lg lg:text-xl font-semibold mb-3 lg:mb-4">Instrucciones de Uso</h3>
          <div className="space-y-2 text-sm lg:text-base text-muted-foreground">
            <p>• <strong>Activación Automática:</strong> En Android, la app solicita permisos automáticamente</p>
            <p>• <strong>Comandos de Voz:</strong> Diga "prender cámara" para activar automáticamente</p>
            <p>• <strong>Análisis Automático:</strong> Una vez activa, analiza cada 5 segundos</p>
            <p>• <strong>Navegación:</strong> Detecta obstáculos, zanjas y peligros</p>
            <p>• <strong>Billetes:</strong> Verifica autenticidad de billetes peruanos</p>
            <p>• <strong>Alertas de Voz:</strong> Recibe notificaciones automáticas por voz</p>
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
