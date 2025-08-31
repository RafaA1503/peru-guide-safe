import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Camera, Mic, MicOff, Eye, AlertTriangle, DollarSign, Volume2 } from 'lucide-react';
import { toast } from 'sonner';

interface AnalysisResult {
  type: 'obstacle' | 'currency' | 'general';
  severity: 'safe' | 'warning' | 'danger';
  message: string;
  confidence: number;
}

const VisionAssistant = () => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [mode, setMode] = useState<'navigation' | 'currency'>('navigation');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

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
      }
      
      // Announce camera started
      speak("Cámara iniciada. Lista para asistir en navegación.");
      
    } catch (error) {
      console.error('Error accessing camera:', error);
      toast.error('No se pudo acceder a la cámara');
      speak("Error al acceder a la cámara. Verifique los permisos.");
    }
  }, []);

  // Stop camera
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
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
    if (!videoRef.current || !canvasRef.current) {
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
      
      // Simulate API call to OpenAI Vision API
      const result = await analyzeImage(imageData, mode);
      
      setAnalysisResult(result);
      speak(result.message);
      
      // Show appropriate toast based on severity
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
  }, [mode, speak]);

  // Mock analysis function (replace with actual OpenAI API call)
  const analyzeImage = async (imageData: string, analysisMode: string): Promise<AnalysisResult> => {
    // This would be replaced with actual OpenAI Vision API call
    const mockResults = {
      navigation: [
        {
          type: 'obstacle' as const,
          severity: 'warning' as const,
          message: "Atención: Detectado escalón a 2 metros frente a usted. Cuidado al caminar.",
          confidence: 0.85
        },
        {
          type: 'obstacle' as const,
          severity: 'danger' as const,
          message: "¡Peligro! Zanja profunda detectada directamente al frente. Deténgase inmediatamente.",
          confidence: 0.92
        },
        {
          type: 'general' as const,
          severity: 'safe' as const,
          message: "Camino despejado. Puede continuar con precaución normal.",
          confidence: 0.78
        }
      ],
      currency: [
        {
          type: 'currency' as const,
          severity: 'warning' as const,
          message: "Billete detectado. Características sospechosas encontradas. Posible falsificación.",
          confidence: 0.76
        },
        {
          type: 'currency' as const,
          severity: 'safe' as const,
          message: "Billete de 20 soles auténtico detectado. Características de seguridad verificadas.",
          confidence: 0.94
        }
      ]
    };

    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const results = mockResults[analysisMode as keyof typeof mockResults];
    return results[Math.floor(Math.random() * results.length)];
  };

  // Voice commands (mock implementation)
  const startListening = useCallback(() => {
    setIsListening(true);
    speak("Escuchando comando de voz");
    
    // Mock voice recognition
    setTimeout(() => {
      setIsListening(false);
      const commands = [
        "Analizar entorno",
        "Verificar billete",
        "¿Qué hay frente a mí?",
        "Cambiar a modo moneda"
      ];
      const randomCommand = commands[Math.floor(Math.random() * commands.length)];
      speak(`Comando recibido: ${randomCommand}`);
      
      if (randomCommand.includes("billete") || randomCommand.includes("moneda")) {
        setMode('currency');
        speak("Cambiado a modo detección de billetes");
      } else if (randomCommand.includes("Analizar")) {
        captureAndAnalyze();
      }
    }, 3000);
  }, [captureAndAnalyze, speak]);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'danger': return 'btn-danger-accessible';
      case 'warning': return 'btn-warning-accessible';
      default: return 'btn-safe-accessible';
    }
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold text-foreground">
            Asistente Visual
          </h1>
          <p className="text-xl text-muted-foreground">
            Tu guía inteligente para navegar con seguridad
          </p>
        </div>

        {/* Mode Toggle */}
        <div className="flex justify-center gap-4">
          <Button
            onClick={() => {
              setMode('navigation');
              speak("Modo navegación activado");
            }}
            className={mode === 'navigation' ? 'btn-primary-accessible' : 'btn-accessible bg-muted text-muted-foreground'}
          >
            <Eye className="w-6 h-6 mr-2" />
            Navegación
          </Button>
          <Button
            onClick={() => {
              setMode('currency');
              speak("Modo detección de billetes activado");
            }}
            className={mode === 'currency' ? 'btn-primary-accessible' : 'btn-accessible bg-muted text-muted-foreground'}
          >
            <DollarSign className="w-6 h-6 mr-2" />
            Billetes
          </Button>
        </div>

        {/* Camera View */}
        <Card className="p-6 space-y-4">
          <div className="relative bg-black rounded-xl overflow-hidden">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-64 object-cover"
            />
            <canvas ref={canvasRef} className="hidden" />
            
            {isAnalyzing && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                <div className="text-white text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
                  <p className="text-lg">Analizando imagen...</p>
                </div>
              </div>
            )}
          </div>

          {/* Analysis Result */}
          {analysisResult && (
            <Card className={`p-4 border-2 ${
              analysisResult.severity === 'danger' ? 'border-danger-zone bg-red-50' :
              analysisResult.severity === 'warning' ? 'border-warning-zone bg-yellow-50' :
              'border-safe-zone bg-green-50'
            }`}>
              <div className="flex items-start gap-3">
                {analysisResult.severity === 'danger' && (
                  <AlertTriangle className="w-6 h-6 text-danger-zone mt-1" />
                )}
                {analysisResult.severity === 'warning' && (
                  <AlertTriangle className="w-6 h-6 text-warning-zone mt-1" />
                )}
                {analysisResult.severity === 'safe' && (
                  <Eye className="w-6 h-6 text-safe-zone mt-1" />
                )}
                <div className="flex-1">
                  <p className="text-lg font-medium text-foreground mb-2">
                    {analysisResult.message}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Confianza: {Math.round(analysisResult.confidence * 100)}%
                  </p>
                </div>
                <Button
                  onClick={() => speak(analysisResult.message)}
                  className="btn-accessible bg-primary text-primary-foreground p-2"
                  size="sm"
                >
                  <Volume2 className="w-4 h-4" />
                </Button>
              </div>
            </Card>
          )}
        </Card>

        {/* Control Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Button
            onClick={captureAndAnalyze}
            disabled={isAnalyzing}
            className="btn-primary-accessible h-20"
          >
            <Camera className="w-8 h-8 mb-2" />
            {mode === 'navigation' ? 'Analizar Entorno' : 'Verificar Billete'}
          </Button>

          <Button
            onClick={startListening}
            disabled={isListening}
            className={`h-20 ${isListening ? 'btn-warning-accessible' : 'btn-safe-accessible'}`}
          >
            {isListening ? (
              <MicOff className="w-8 h-8 mb-2" />
            ) : (
              <Mic className="w-8 h-8 mb-2" />
            )}
            {isListening ? 'Escuchando...' : 'Comando de Voz'}
          </Button>

          <Button
            onClick={() => {
              if (analysisResult) {
                speak(analysisResult.message);
              } else {
                speak("No hay mensaje para repetir");
              }
            }}
            className="btn-accessible bg-muted text-muted-foreground h-20"
          >
            <Volume2 className="w-8 h-8 mb-2" />
            Repetir Mensaje
          </Button>
        </div>

        {/* Instructions */}
        <Card className="p-6 bg-muted/50">
          <h3 className="text-xl font-semibold mb-4">Instrucciones de Uso</h3>
          <div className="space-y-2 text-muted-foreground">
            <p>• <strong>Navegación:</strong> Detecta obstáculos, zanjas y peligros en el camino</p>
            <p>• <strong>Billetes:</strong> Verifica la autenticidad de billetes peruanos</p>
            <p>• <strong>Voz:</strong> Use comandos de voz para mayor accesibilidad</p>
            <p>• <strong>Botones:</strong> Botones grandes y fáciles de encontrar</p>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default VisionAssistant;