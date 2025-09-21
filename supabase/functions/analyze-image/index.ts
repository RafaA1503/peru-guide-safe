import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Rate limiting y cache en memoria
const requestTracker = new Map<string, { count: number; lastReset: number; lastAnalysis: number }>();
const analysisCache = new Map<string, { result: any; timestamp: number }>();
const analysisQueue: Array<{ resolve: Function; reject: Function; imageData: string; clientId: string }> = [];
let isProcessingQueue = false;

// Configuración
const RATE_LIMIT = {
  maxRequestsPerMinute: 3, // Máximo 3 análisis por minuto por cliente
  windowMs: 60 * 1000, // Ventana de 1 minuto
  minTimeBetweenRequests: 15000, // Mínimo 15 segundos entre análisis
};

const CACHE_CONFIG = {
  maxAge: 5 * 60 * 1000, // Cache por 5 minutos
  maxEntries: 50, // Máximo 50 entradas en cache
};

// Generar hash simple de imagen para cache
function generateImageHash(imageData: string): string {
  return imageData.substring(0, 100) + imageData.length.toString();
}

// Verificar rate limiting
function checkRateLimit(clientId: string): { allowed: boolean; waitTime?: number } {
  const now = Date.now();
  const tracker = requestTracker.get(clientId);

  if (!tracker) {
    requestTracker.set(clientId, { count: 1, lastReset: now, lastAnalysis: now });
    return { allowed: true };
  }

  // Reset contador si ha pasado la ventana de tiempo
  if (now - tracker.lastReset > RATE_LIMIT.windowMs) {
    tracker.count = 1;
    tracker.lastReset = now;
    tracker.lastAnalysis = now;
    return { allowed: true };
  }

  // Verificar tiempo mínimo entre requests
  const timeSinceLastAnalysis = now - tracker.lastAnalysis;
  if (timeSinceLastAnalysis < RATE_LIMIT.minTimeBetweenRequests) {
    const waitTime = RATE_LIMIT.minTimeBetweenRequests - timeSinceLastAnalysis;
    return { allowed: false, waitTime: Math.ceil(waitTime / 1000) };
  }

  // Verificar límite por minuto
  if (tracker.count >= RATE_LIMIT.maxRequestsPerMinute) {
    const waitTime = RATE_LIMIT.windowMs - (now - tracker.lastReset);
    return { allowed: false, waitTime: Math.ceil(waitTime / 1000) };
  }

  tracker.count++;
  tracker.lastAnalysis = now;
  return { allowed: true };
}

// Limpiar cache antiguo
function cleanCache() {
  const now = Date.now();
  const entries = Array.from(analysisCache.entries());
  
  // Eliminar entradas antiguas
  for (const [key, value] of entries) {
    if (now - value.timestamp > CACHE_CONFIG.maxAge) {
      analysisCache.delete(key);
    }
  }

  // Mantener solo las entradas más recientes si excede el límite
  if (analysisCache.size > CACHE_CONFIG.maxEntries) {
    const sortedEntries = entries
      .sort((a, b) => b[1].timestamp - a[1].timestamp)
      .slice(0, CACHE_CONFIG.maxEntries);
    
    analysisCache.clear();
    for (const [key, value] of sortedEntries) {
      analysisCache.set(key, value);
    }
  }
}

// Generar respuestas inteligentes sin análisis
function generateFallbackResponse(): any {
  const fallbackResponses = [
    {
      type: 'general',
      severity: 'safe',
      message: 'Continúa con precaución. El sistema está en pausa temporal.',
      confidence: 0.8
    },
    {
      type: 'general',
      severity: 'warning',
      message: 'Mantén atención al entorno mientras se reactiva el análisis automático.',
      confidence: 0.7
    },
    {
      type: 'general',
      severity: 'safe',
      message: 'Camina despacio y mantente alerta. El análisis se reanudará pronto.',
      confidence: 0.8
    }
  ];

  return fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];
}

// Procesar cola de análisis
async function processQueue() {
  if (isProcessingQueue || analysisQueue.length === 0) return;
  
  isProcessingQueue = true;
  console.log(`Procesando cola de análisis. ${analysisQueue.length} solicitudes pendientes.`);

  while (analysisQueue.length > 0) {
    const queueItem = analysisQueue.shift();
    if (!queueItem) continue;

    try {
      const result = await performOpenAIAnalysis(queueItem.imageData);
      queueItem.resolve(result);
    } catch (error) {
      console.error('Error procesando item de cola:', error);
      queueItem.reject(error);
    }

    // Esperar entre análisis para respetar rate limits de OpenAI
    if (analysisQueue.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  isProcessingQueue = false;
}

// Realizar análisis con OpenAI (función extraída)
async function performOpenAIAnalysis(imageData: string): Promise<any> {
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
  
  if (!openaiApiKey) {
    throw new Error('OpenAI API key no configurado');
  }

  const unifiedPrompt = `Eres un asistente visual para personas con discapacidad visual. Analiza esta imagen EN TIEMPO REAL para detectar:

PRIORIDAD MÁXIMA - PELIGROS INMEDIATOS:
1. OBSTÁCULOS PELIGROSOS:
   - Escalones hacia abajo (PELIGRO ALTO)
   - Hoyos, desniveles, zanjas
   - Objetos punzantes o cortantes
   - Vehículos en movimiento cercanos
   - Personas corriendo hacia la cámara
   - Superficies mojadas/resbalosas

2. OBSTÁCULOS DE NAVEGACIÓN:
   - Postes, columnas en el camino
   - Mobiliario urbano (bancas, cestos)
   - Puertas abiertas, ventanas bajas
   - Cambios de superficie (césped a concreto)
   - Multitudes de personas

3. BILLETES PERUANOS (si aparecen):
   - Identifica denominación (10, 20, 50, 100, 200 soles)
   - Verifica autenticidad por colores y textura visible
   - ALERTA si detectas características falsas

4. DETECCIÓN GENERAL DE OBJETOS:
   - Identifica y nombra los objetos principales visibles
   - Menciona personas, animales, vehículos
   - Describe muebles, electrodomésticos, herramientas
   - Identifica alimentos, bebidas, productos
   - Señala elementos arquitectónicos (puertas, ventanas, escaleras)

Responde ÚNICAMENTE con este JSON:
{
  "type": "obstacle|currency|general|objects",
  "severity": "safe|warning|danger", 
  "message": "Descripción CLARA del peligro, objetos o situación",
  "confidence": número 0.7-1.0
}

CRITERIOS DE SEVERIDAD:
- "danger": Escalones, hoyos, tráfico, objetos punzantes, billetes falsos
- "warning": Obstáculos menores, aglomeraciones, billetes dudosos
- "safe": Camino despejado, billetes auténticos, entorno normal

EJEMPLOS DE MENSAJES:
- "PELIGRO: Escalón de 20cm hacia abajo"
- "CUIDADO: Poste a 1 metro adelante"  
- "Billete de 50 soles auténtico"
- "Veo una mesa de madera, dos sillas y una taza sobre ella"
- "Hay una persona caminando, un perro pequeño y un auto estacionado"
- "Detecta: celular, llaves, cartera y una botella de agua"`;

  console.log('Enviando solicitud a OpenAI API con gpt-4o-mini...');
  
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: unifiedPrompt
            },
            {
              type: 'image_url',
              image_url: {
                url: imageData
              }
            }
          ]
        }
      ],
      response_format: { type: 'json_object' },
      max_tokens: 200,
      temperature: 0
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Error de OpenAI API: ${response.status} - ${errorText}`);
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const openaiResult = await response.json();
  const content = openaiResult.choices[0]?.message?.content;

  if (!content) {
    throw new Error('No hay contenido en la respuesta de OpenAI');
  }

  // Parse JSON response
  const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
  const cleaned = contentStr.replace(/```json/i, '').replace(/```/g, '').trim();
  
  let analysisResult = JSON.parse(cleaned);
  
  // Validar que tenga los campos requeridos
  if (!analysisResult.type || !analysisResult.severity || !analysisResult.message) {
    throw new Error('Respuesta incompleta de OpenAI');
  }
  
  // Asegurar que confidence tenga un valor válido
  if (!analysisResult.confidence || analysisResult.confidence < 0.7) {
    analysisResult.confidence = 0.8;
  }

  return analysisResult;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { imageData } = await req.json();
    console.log('Recibida solicitud de análisis de imagen');
    
    // Obtener ID del cliente (usando IP como identificador)
    const clientId = req.headers.get('x-forwarded-for') || 
                     req.headers.get('x-real-ip') || 
                     'unknown-client';
    
    // Limpiar cache periódicamente
    if (Math.random() < 0.1) { // 10% de probabilidad
      cleanCache();
    }
    
    // Verificar rate limiting
    const rateLimitCheck = checkRateLimit(clientId);
    if (!rateLimitCheck.allowed) {
      console.log(`Rate limit excedido para cliente ${clientId}. Esperar ${rateLimitCheck.waitTime}s`);
      
      const fallbackResponse = {
        type: 'general',
        severity: 'warning',
        message: `Sistema en pausa. Reintentando en ${rateLimitCheck.waitTime} segundos. Mantente alerta.`,
        confidence: 0.7,
        rateLimited: true,
        waitTime: rateLimitCheck.waitTime
      };
      
      return new Response(
        JSON.stringify(fallbackResponse),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verificar cache
    const imageHash = generateImageHash(imageData);
    const cachedResult = analysisCache.get(imageHash);
    
    if (cachedResult && Date.now() - cachedResult.timestamp < CACHE_CONFIG.maxAge) {
      console.log('Respuesta desde cache');
      return new Response(
        JSON.stringify({ ...cachedResult.result, fromCache: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Si hay muchas solicitudes en cola, dar respuesta de fallback
    if (analysisQueue.length > 5) {
      console.log('Cola saturada, enviando respuesta de fallback');
      const fallbackResponse = generateFallbackResponse();
      return new Response(
        JSON.stringify({ ...fallbackResponse, queueSaturated: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Agregar a cola y procesar
    const analysisPromise = new Promise((resolve, reject) => {
      analysisQueue.push({ resolve, reject, imageData, clientId });
      processQueue(); // Iniciar procesamiento si no está activo
    });

    // Timeout para evitar esperas indefinidas
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Timeout')), 30000); // 30 segundos timeout
    });

    try {
      const analysisResult = await Promise.race([analysisPromise, timeoutPromise]);
      
      // Guardar en cache
      analysisCache.set(imageHash, {
        result: analysisResult,
        timestamp: Date.now()
      });
      
      console.log('Análisis completado exitosamente');
      return new Response(
        JSON.stringify(analysisResult),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
      
    } catch (analysisError) {
      console.error('Error en análisis:', analysisError);
      
      // Si hay error, dar respuesta inteligente
      const fallbackResponse = generateFallbackResponse();
      return new Response(
        JSON.stringify({ ...fallbackResponse, error: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error) {
    console.error('Error en analyze-image:', error);
    const errMsg = typeof error === 'string' ? error : (error as Error)?.message || '';
    
    // Generar respuesta de fallback apropiada
    const fallbackResponse = generateFallbackResponse();
    const enhancedResponse = {
      ...fallbackResponse,
      message: errMsg.includes('429') || errMsg.includes('rate_limit_exceeded') 
        ? 'Sistema temporalmente ocupado. Mantente alerta mientras se reactiva.'
        : fallbackResponse.message,
      systemError: true
    };
    
    return new Response(
      JSON.stringify(enhancedResponse),
      { 
        status: 200,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );
  }
});