import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { imageData } = await req.json()
    console.log('Recibida solicitud de análisis de imagen')
    
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiApiKey) {
      console.error('OpenAI API key no configurado')
      throw new Error('OpenAI API key not configured')
    }

    // Prompt optimizado para análisis en tiempo real con enfoque en seguridad
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

Responde ÚNICAMENTE con este JSON:
{
  "type": "obstacle|currency|general",
  "severity": "safe|warning|danger", 
  "message": "Descripción CLARA del peligro o situación",
  "confidence": número 0.7-1.0
}

CRITERIOS DE SEVERIDAD:
- "danger": Escalones, hoyos, tráfico, objetos punzantes, billetes falsos
- "warning": Obstáculos menores, aglomeraciones, billetes dudosos
- "safe": Camino despejado, billetes auténticos, entorno normal

MENSAJE DEBE SER DIRECTO: "PELIGRO: Escalón de 20cm hacia abajo" o "CUIDADO: Poste a 1 metro" o "Billete de 50 soles auténtico"`

    console.log('Enviando solicitud a OpenAI API con gpt-5-nano...')
    
    let retries = 0
    const maxRetries = 2
    let response
    
    while (retries <= maxRetries) {
      try {
        response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-5-nano-2025-08-07',
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
            max_completion_tokens: 150
          })
        })
        
        if (response.ok) {
          break // Salir del loop si la respuesta es exitosa
        } else if (response.status === 429 && retries < maxRetries) {
          // Rate limit - esperar y reintentar
          const waitTime = Math.pow(2, retries) * 1000 // Backoff exponencial
          console.log(`Rate limit alcanzado, esperando ${waitTime}ms antes de reintentar...`)
          await new Promise(resolve => setTimeout(resolve, waitTime))
          retries++
          continue
        } else {
          // Otro error, lanzar excepción
          const errorText = await response.text()
          console.error(`Error de OpenAI API: ${response.status} - ${errorText}`)
          throw new Error(`OpenAI API error: ${response.status}`)
        }
      } catch (fetchError) {
        if (retries < maxRetries) {
          console.log(`Error de red, reintentando en ${1000 * (retries + 1)}ms...`)
          await new Promise(resolve => setTimeout(resolve, 1000 * (retries + 1)))
          retries++
          continue
        } else {
          throw fetchError
        }
      }
    }

    const openaiResult = await response.json()
    console.log('Respuesta de OpenAI recibida:', JSON.stringify(openaiResult, null, 2))
    
    const content = openaiResult.choices[0]?.message?.content

    if (!content) {
      console.error('No hay contenido en la respuesta de OpenAI')
      throw new Error('No response from OpenAI')
    }

    // Parse JSON response
    let analysisResult
    const contentStr = typeof content === 'string' ? content : JSON.stringify(content)
    const cleaned = contentStr.replace(/```json/i, '').replace(/```/g, '').trim()
    
    try {
      analysisResult = JSON.parse(cleaned)
      console.log('Resultado de análisis:', analysisResult)
      
      // Validar que tenga los campos requeridos
      if (!analysisResult.type || !analysisResult.severity || !analysisResult.message) {
        throw new Error('Respuesta incompleta de OpenAI')
      }
      
      // Asegurar que confidence tenga un valor válido
      if (!analysisResult.confidence || analysisResult.confidence < 0.7) {
        analysisResult.confidence = 0.8
      }
      
    } catch (e) {
      console.error('Error parseando JSON:', e)
      // Fallback si falla el parsing
      analysisResult = {
        type: 'general',
        severity: 'warning',
        message: 'No se pudo analizar la imagen correctamente. Intente nuevamente.',
        confidence: 0.7
      }
    }

    return new Response(
      JSON.stringify(analysisResult),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    )

  } catch (error) {
    console.error('Error en analyze-image:', error)
    return new Response(
      JSON.stringify({ 
        type: 'general',
        severity: 'warning',
        message: 'Error al conectar con el servicio de análisis. Verifique su conexión.',
        confidence: 0.0
      }),
      { 
        status: 500,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    )
  }
})