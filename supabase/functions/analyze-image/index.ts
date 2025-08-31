import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { imageData, mode } = await req.json()
    
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiApiKey) {
      throw new Error('OpenAI API key not configured')
    }

    // Prepare prompt based on mode
    const navigationPrompt = `Eres un asistente visual para personas con discapacidad visual. Analiza esta imagen y describe ÚNICAMENTE los peligros o obstáculos que podrían afectar la seguridad al caminar. 

Responde en español con este formato JSON exacto:
{
  "type": "obstacle",
  "severity": "safe|warning|danger", 
  "message": "Descripción clara y concisa del peligro o si está despejado",
  "confidence": número entre 0.0 y 1.0
}

Criterios:
- "danger": zanjas, escalones altos, obstáculos peligrosos directamente al frente
- "warning": escalones pequeños, obstáculos menores, cambios de superficie
- "safe": camino despejado, sin obstáculos significativos

Mensaje debe ser claro, directo y útil para navegación segura.`

    const currencyPrompt = `Eres un experto en detección de billetes peruanos falsos. Analiza esta imagen y determina si el billete es auténtico o falso.

Responde en español con este formato JSON exacto:
{
  "type": "currency",
  "severity": "safe|warning|danger",
  "message": "Descripción del análisis del billete",
  "confidence": número entre 0.0 y 1.0
}

Criterios:
- "safe": billete auténtico con características de seguridad correctas
- "warning": billete con características dudosas o poco claras
- "danger": billete claramente falso

Enfócate en características de seguridad visibles como textura, colores, marcas de agua, etc.`

    const prompt = mode === 'currency' ? currencyPrompt : navigationPrompt

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-2025-04-14',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt
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
        max_tokens: 300,
        temperature: 0.3
      })
    })

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`)
    }

    const openaiResult = await response.json()
    const content = openaiResult.choices[0]?.message?.content

    if (!content) {
      throw new Error('No response from OpenAI')
    }

    // Parse JSON response
    let analysisResult
    try {
      analysisResult = JSON.parse(content)
    } catch (e) {
      // Fallback if JSON parsing fails
      analysisResult = {
        type: mode === 'currency' ? 'currency' : 'obstacle',
        severity: 'warning',
        message: content,
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
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ 
        type: 'general',
        severity: 'warning',
        message: 'Error al analizar la imagen. Inténtelo nuevamente.',
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