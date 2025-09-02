import "https://deno.land/x/xhr@0.1.0/mod.ts";
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
    const { imageData } = await req.json()
    
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiApiKey) {
      throw new Error('OpenAI API key not configured')
    }

    // Unified prompt for both obstacle and currency detection
    const unifiedPrompt = `Eres un asistente visual para personas con discapacidad visual. Analiza esta imagen y:

1. PRIMERO: Verifica si hay billetes peruanos en la imagen
2. SEGUNDO: Detecta obstáculos o peligros para navegación

Responde en español con este formato JSON exacto:
{
  "type": "obstacle|currency|general",
  "severity": "safe|warning|danger", 
  "message": "Descripción clara y concisa",
  "confidence": número entre 0.0 y 1.0
}

DEVUELVE SOLO EL JSON, sin texto adicional ni bloques de código.

PRIORIDADES:
- Si detectas un billete peruano: type="currency", analiza autenticidad
- Si no hay billetes: type="obstacle", describe peligros de navegación
- Si no hay nada relevante: type="general", informa que está despejado

CRITERIOS BILLETES:
- "safe": billete auténtico con características correctas
- "warning": billete dudoso o poco claro
- "danger": billete claramente falso

CRITERIOS OBSTÁCULOS:
- "danger": zanjas, escalones altos, peligros directos
- "warning": escalones pequeños, cambios de superficie
- "safe": camino despejado

Mensaje debe ser claro, directo y útil.`

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

    // Parse JSON response (strip code fences if any)
    let analysisResult
    const contentStr = typeof content === 'string' ? content : JSON.stringify(content)
    const cleaned = contentStr.replace(/```json/i, '').replace(/```/g, '').trim()
    try {
      analysisResult = JSON.parse(cleaned)
    } catch (e) {
      // Fallback if JSON parsing fails
      analysisResult = {
        type: 'general',
        severity: 'warning',
        message: cleaned,
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