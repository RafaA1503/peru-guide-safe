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

    // Prompt mejorado para detectar billetes peruanos falsos y obstáculos
    const unifiedPrompt = `Eres un asistente visual experto para personas con discapacidad visual en Perú. Analiza esta imagen y:

1. PRIMERO: ¿Hay billetes peruanos? Examina CARACTERÍSTICAS DE AUTENTICIDAD:
   - Billetes de 10 soles: Color verde, Antonio Raymondi, textura especial
   - Billetes de 20 soles: Color naranja/marrón, Raúl Porras Barrenechea
   - Billetes de 50 soles: Color violeta, Abraham Valdelomar
   - Billetes de 100 soles: Color verde/azul, Jorge Basadre
   - Billetes de 200 soles: Color amarillo/dorado, Santa Rosa de Lima
   
   CARACTERÍSTICAS FALSAS COMUNES:
   - Colores apagados o incorrectos
   - Textura lisa (no rugosa)
   - Impresión de mala calidad
   - Falta de marca de agua
   - Bordes poco definidos

2. SEGUNDO: Si no hay billetes, detecta OBSTÁCULOS PELIGROSOS:
   - Escalones, hoyos, desniveles
   - Objetos en el suelo
   - Cambios de superficie
   - Puertas abiertas, muebles

Responde SOLO con este JSON exacto:
{
  "type": "currency|obstacle|general",
  "severity": "safe|warning|danger", 
  "message": "Descripción específica y útil",
  "confidence": número entre 0.7 y 1.0
}

DEVUELVE ÚNICAMENTE EL JSON, sin explicaciones adicionales.

REGLAS DE RESPUESTA:
- BILLETES AUTÉNTICOS: type="currency", severity="safe", "Billete de [X] soles auténtico detectado"
- BILLETES FALSOS: type="currency", severity="danger", "ALERTA: Billete de [X] soles FALSO detectado - [razón específica]"
- BILLETES DUDOSOS: type="currency", severity="warning", "Billete de [X] soles - verificar autenticidad"
- OBSTÁCULOS PELIGROSOS: type="obstacle", severity="danger", "PELIGRO: [descripción específica]"
- OBSTÁCULOS MENORES: type="obstacle", severity="warning", "CUIDADO: [descripción]"
- CAMINO LIBRE: type="general", severity="safe", "Camino despejado, puede continuar"`

    console.log('Enviando solicitud a OpenAI API...')
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
        max_tokens: 400,
        temperature: 0.1
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`Error de OpenAI API: ${response.status} - ${errorText}`)
      throw new Error(`OpenAI API error: ${response.status}`)
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