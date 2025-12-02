/**
 * Anthropic AI Provider Implementation
 *
 * C#-compatible implementation for WebAPI V2 integration
 * Uses PlantAnalysisAsyncRequestDto/ResponseDto with correct casing
 *
 * Model: claude-3-5-sonnet-20241022
 * Pricing: Input $3/M, Output $15/M
 */

import Anthropic from '@anthropic-ai/sdk';
import { PlantAnalysisAsyncRequestDto, PlantAnalysisAsyncResponseDto, TokenUsage } from '../types/messages';
import pino from 'pino';
import * as defaults from './defaults';

export class AnthropicProvider {
  private client: Anthropic;
  private modelName: string;
  private logger: pino.Logger;

  constructor(apiKey: string, logger: pino.Logger, model?: string) {
    this.client = new Anthropic({ apiKey });
    this.modelName = model || 'claude-3-5-sonnet-20241022';
    this.logger = logger;
  }

  /**
   * Main analysis method - C#-compatible response generation
   */
  async analyzeImages(request: PlantAnalysisAsyncRequestDto): Promise<PlantAnalysisAsyncResponseDto> {
    const startTime = Date.now();
    const receivedAt = new Date();

    try {
      this.logger.info({
        analysisId: request.AnalysisId,
        farmerId: request.FarmerId,
        imageUrl: request.ImageUrl,
        cropType: request.CropType,
      }, 'Starting Anthropic analysis');

      const systemPrompt = this.buildSystemPrompt(request);
      const imageContent = await this.buildImageContent(request.ImageUrl);

      this.logger.debug({
        analysisId: request.AnalysisId,
        model: this.modelName,
      }, 'Calling Anthropic API');

      const response = await this.client.messages.create({
        model: this.modelName,
        max_tokens: 2000,
        temperature: 0.7,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: imageContent,
          },
        ],
      });

      const analysisText = response.content[0]?.type === 'text' ? response.content[0].text : '';
      const processingTimeMs = Date.now() - startTime;

      this.logger.debug({
        analysisId: request.AnalysisId,
        responseLength: analysisText.length,
        processingTimeMs,
      }, 'Anthropic API response received');

      // Claude sometimes wraps JSON in markdown code blocks
      let cleanedText = analysisText.trim();
      if (cleanedText.startsWith('```json')) {
        cleanedText = cleanedText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleanedText.startsWith('```')) {
        cleanedText = cleanedText.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      const analysisResult = JSON.parse(cleanedText);
      const tokenUsage = this.calculateTokenUsage(response);

      // Return C#-compatible response with MIXED casing
      return {
        // Analysis results (snake_case - has [JsonProperty])
        plant_identification: analysisResult.plant_identification || defaults.getDefaultPlantIdentification(),
        health_assessment: analysisResult.health_assessment || defaults.getDefaultHealthAssessment(),
        nutrient_status: analysisResult.nutrient_status || defaults.getDefaultNutrientStatus(),
        pest_disease: analysisResult.pest_disease || defaults.getDefaultPestDisease(),
        environmental_stress: analysisResult.environmental_stress || defaults.getDefaultEnvironmentalStress(),
        cross_factor_insights: analysisResult.cross_factor_insights || [],
        recommendations: analysisResult.recommendations || defaults.getDefaultRecommendations(),
        summary: analysisResult.summary || defaults.getDefaultSummary(),

        // Metadata (snake_case - has [JsonProperty])
        analysis_id: request.AnalysisId,
        timestamp: new Date().toISOString(),
        user_id: request.UserId,
        farmer_id: request.FarmerId,
        sponsor_id: request.SponsorId,

        // CRITICAL: PascalCase (NO [JsonProperty] in C#)
        SponsorUserId: request.SponsorUserId,
        SponsorshipCodeId: request.SponsorshipCodeId,

        location: request.Location,
        gps_coordinates: request.GpsCoordinates,
        altitude: request.Altitude,
        field_id: request.FieldId,
        crop_type: request.CropType,
        planting_date: request.PlantingDate,
        expected_harvest_date: request.ExpectedHarvestDate,
        last_fertilization: request.LastFertilization,
        last_irrigation: request.LastIrrigation,
        previous_treatments: request.PreviousTreatments,
        weather_conditions: request.WeatherConditions,
        temperature: request.Temperature,
        humidity: request.Humidity,
        soil_type: request.SoilType,
        urgency_level: request.UrgencyLevel,
        notes: request.Notes,
        contact_info: request.ContactInfo,
        additional_info: request.AdditionalInfo,

        image_url: request.ImageUrl,
        image_path: request.ImageUrl,

        // Processing metadata (ALL PascalCase - NO [JsonProperty])
        processing_metadata: {
          ParseSuccess: true,
          ProcessingTimestamp: new Date().toISOString(),
          AiModel: this.modelName,
          WorkflowVersion: '2.0.0',
          ReceivedAt: receivedAt.toISOString(),
          ProcessingTimeMs: processingTimeMs,
          RetryCount: 0,
        },

        // Image metadata (ALL PascalCase - NO [JsonProperty])
        image_metadata: {
          URL: request.ImageUrl,  // CRITICAL: PascalCase!
          Format: 'JPEG',
        },

        // Token usage (simplified flat structure)
        token_usage: tokenUsage,

        // Status flags
        success: true,
        error: false,
        error_message: null,
        error_type: null,

        // Routing metadata (from request)
        response_queue: request.ResponseQueue,
      };
    } catch (error: any) {
      const processingTimeMs = Date.now() - startTime;
      const errorMessage = error?.message || 'Unknown Anthropic API error';

      this.logger.error({
        analysisId: request.AnalysisId,
        error: errorMessage,
        processingTimeMs,
      }, 'Anthropic analysis failed');

      return this.buildErrorResponse(request, errorMessage, processingTimeMs, receivedAt);
    }
  }

  /**
   * Build system prompt - Turkish analysis prompt
   */
  private buildSystemPrompt(request: PlantAnalysisAsyncRequestDto): string {
    let prompt = `You are an expert agricultural analyst with deep knowledge in plant pathology, nutrition (macro and micro elements), pest management, physiological disorders, soil science, and environmental stress factors.

Your task is to analyze the provided plant image comprehensively and return a structured JSON report.

============================================
CRITICAL INSTRUCTIONS
============================================

1. **ACCURATE SPECIES IDENTIFICATION:**
   - Carefully identify the plant species and variety
   - Use botanical characteristics visible in the image
   - If uncertain, provide your best assessment with confidence score

2. **DETAILED NUTRIENT DEFICIENCY ANALYSIS:**
   - Assess EACH of the 14 key nutrients individually
   - Use specific visual symptoms (chlorosis patterns, necrosis, stunting, etc.)
   - Identify primary and secondary deficiencies
   - Rate severity level

3. **PEST AND DISEASE DIAGNOSIS:**
   - Look for visible pests (insects, mites, etc.)
   - Identify disease symptoms (fungal, bacterial, viral)
   - Describe damage patterns and affected areas
   - Estimate spread risk

4. **ENVIRONMENTAL STRESS ASSESSMENT:**
   - Identify water stress (drought or waterlogging)
   - Detect temperature stress (heat or cold damage)
   - Recognize light-related issues
   - Note physical damage

5. **ACTIONABLE RECOMMENDATIONS:**
   - Provide SPECIFIC, PRACTICAL recommendations
   - Prioritize immediate actions
   - Include preventive measures
   - Estimate urgency and timeframe
`;

    // Add context information
    prompt += `\n============================================\nCONTEXT INFORMATION PROVIDED\n============================================\n\n`;
    prompt += `Analysis ID: ${request.AnalysisId}\n`;
    prompt += `Farmer ID: ${request.FarmerId || 'Not provided'}\n`;
    prompt += `Location: ${request.Location || 'Not provided'}\n`;

    if (request.GpsCoordinates) {
      prompt += `GPS Coordinates: ${request.GpsCoordinates.Lat}, ${request.GpsCoordinates.Lng}\n`;
    }

    if (request.Altitude) prompt += `Altitude: ${request.Altitude}m\n`;
    if (request.CropType) prompt += `Crop Type: ${request.CropType}\n`;
    if (request.SoilType) prompt += `Soil Type: ${request.SoilType}\n`;
    if (request.WeatherConditions) prompt += `Weather: ${request.WeatherConditions}\n`;
    if (request.Temperature) prompt += `Temperature: ${request.Temperature}°C\n`;
    if (request.Humidity) prompt += `Humidity: ${request.Humidity}%\n`;
    if (request.LastFertilization) prompt += `Last Fertilization: ${request.LastFertilization}\n`;
    if (request.LastIrrigation) prompt += `Last Irrigation: ${request.LastIrrigation}\n`;

    if (request.PreviousTreatments && request.PreviousTreatments.length > 0) {
      prompt += `Previous Treatments:\n`;
      request.PreviousTreatments.forEach((treatment, index) => {
        prompt += `  ${index + 1}. ${treatment}\n`;
      });
    }

    if (request.UrgencyLevel) prompt += `Urgency Level: ${request.UrgencyLevel}\n`;
    if (request.Notes) prompt += `Additional Notes: ${request.Notes}\n`;

    // Add JSON schema
    prompt += `\n============================================\nOUTPUT FORMAT\n============================================\n\n`;
    prompt += `Return ONLY a valid JSON object with this EXACT structure (no additional text):\n\n`;

    prompt += `{
  "plant_identification": {
    "species": "string (bitki türü, örn: Domates, Buğday)",
    "variety": "string (çeşit, örn: Rio Grande, emin değilseniz 'Bilinmiyor')",
    "growth_stage": "fide | vejetatif | çiçeklenme | meyve | unknown",
    "confidence": 0.85,
    "identifying_features": ["array of strings", "belirgin özellikler"],
    "visible_parts": ["array of strings", "görünen bitki kısımları"]
  },
  "nutrient_status": {
    "nitrogen": "normal | eksik | fazla | unknown",
    "phosphorus": "normal | eksik | fazla | unknown",
    "potassium": "normal | eksik | fazla | unknown",
    "calcium": "normal | eksik | fazla | unknown",
    "magnesium": "normal | eksik | fazla | unknown",
    "sulfur": "normal | eksik | fazla | unknown",
    "iron": "normal | eksik | fazla | unknown",
    "manganese": "normal | eksik | fazla | unknown",
    "zinc": "normal | eksik | fazla | unknown",
    "copper": "normal | eksik | fazla | unknown",
    "boron": "normal | eksik | fazla | unknown",
    "molybdenum": "normal | eksik | fazla | unknown",
    "chlorine": "normal | eksik | fazla | unknown",
    "nickel": "normal | eksik | fazla | unknown",
    "primary_deficiency": "string (en önemli eksiklik veya 'Yok')",
    "secondary_deficiencies": ["array", "diğer eksiklikler"],
    "severity": "yok | düşük | orta | yüksek | kritik | unknown",
    "visual_symptoms": "string (görsel belirtiler detaylı açıklama)"
  },
  "health_assessment": {
    "overall_health": "sağlıklı | hafif sorunlu | orta sorunlu | ciddi sorunlu | kritik | unknown",
    "vigor": "zayıf | orta | iyi | mükemmel | unknown",
    "leaf_condition": "string (yaprak durumu açıklaması)",
    "stem_condition": "string (gövde durumu açıklaması)",
    "root_condition": "string (kök durumu, görünüyorsa)",
    "color_assessment": "string (renk değerlendirmesi)",
    "abnormalities": ["array", "anormallikler listesi"]
  },
  "pest_disease": {
    "pests_detected": [
      {
        "pest_name": "string (zararlı adı)",
        "scientific_name": "string (bilimsel adı)",
        "severity": "düşük | orta | yüksek | kritik",
        "visible_damage": "string (görünen hasar açıklaması)",
        "lifecycle_stage": "string (yaşam döngüsü evresi)"
      }
    ],
    "diseases_detected": [
      {
        "disease_name": "string (hastalık adı)",
        "pathogen_type": "fungal | bacterial | viral | unknown",
        "severity": "düşük | orta | yüksek | kritik",
        "symptoms": "string (semptom açıklaması)",
        "affected_parts": ["array", "etkilenen kısımlar"]
      }
    ],
    "damage_pattern": "string (hasar pattern açıklaması)",
    "affected_area_percentage": 25,
    "spread_risk": "yok | düşük | orta | yüksek",
    "primary_issue": "string (ana sorun)"
  },
  "environmental_stress": {
    "water_stress": {
      "type": "none | drought | waterlogging | unknown",
      "severity": "yok | düşük | orta | yüksek | unknown",
      "indicators": ["array", "göstergeler"]
    },
    "temperature_stress": {
      "type": "none | heat | cold | unknown",
      "severity": "yok | düşük | orta | yüksek | unknown",
      "indicators": ["array", "göstergeler"]
    },
    "light_stress": {
      "type": "none | insufficient | excessive | unknown",
      "severity": "yok | düşük | orta | yüksek | unknown",
      "indicators": ["array", "göstergeler"]
    },
    "physical_damage": {
      "present": true,
      "type": "string (hasar tipi)",
      "severity": "yok | düşük | orta | yüksek | unknown"
    }
  },
  "recommendations": {
    "immediate_actions": [
      {
        "action": "string (yapılacak iş)",
        "priority": "düşük | orta | yüksek | kritik",
        "timeframe": "string (zaman dilimi)",
        "expected_outcome": "string (beklenen sonuç)"
      }
    ],
    "fertilization": {
      "needed": true,
      "nutrients_to_apply": ["array", "uygulanacak besinler"],
      "application_method": "string (uygulama yöntemi)",
      "timing": "string (zamanlama)"
    },
    "pest_disease_management": {
      "treatment_needed": true,
      "recommended_products": ["array", "önerilen ürünler (genel kategoriler)"],
      "application_timing": "string (uygulama zamanı)",
      "precautions": ["array", "önlemler"]
    },
    "irrigation": {
      "adjustment_needed": true,
      "recommendation": "string (sulama önerisi)",
      "frequency": "string (sıklık)"
    },
    "preventive_measures": ["array", "önleyici tedbirler"],
    "monitoring": "string (izleme önerileri)"
  },
  "summary": {
    "main_findings": "string (ana bulgular özeti - 2-3 cümle)",
    "diagnosis": "string (teşhis - 2-3 cümle)",
    "action_summary": "string (yapılacaklar özeti - 2-3 cümle)",
    "urgency": "düşük | orta | yüksek | kritik",
    "prognosis": "mükemmel | iyi | orta | kötü | unknown",
    "confidence_level": 0.85
  },
  "cross_factor_insights": [
    {
      "interaction": "string (etkileşim açıklaması)",
      "combined_effect": "string (birleşik etki)",
      "recommendation": "string (öneri)"
    }
  ]
}`;

    prompt += `\n\n============================================\nIMPORTANT NOTES\n============================================\n\n`;
    prompt += `- Return ONLY the JSON object, no additional text\n`;
    prompt += `- All string values should be in Turkish\n`;
    prompt += `- Use "unknown" when uncertain, but provide best assessment when possible\n`;
    prompt += `- Be specific and actionable in recommendations\n`;
    prompt += `- Base confidence scores on image quality and symptom clarity\n\n`;

    return prompt;
  }

  /**
   * Build image content for Anthropic API
   * Anthropic uses different format than OpenAI
   */
  private async buildImageContent(imageUrl: string): Promise<any[]> {
    const content: any[] = [];

    try {
      // Fetch image and convert to base64
      const response = await fetch(imageUrl);
      const buffer = await response.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      const mimeType = response.headers.get('content-type') || 'image/jpeg';

      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: mimeType,
          data: base64,
        },
      });

      // Add text prompt at the end
      content.push({
        type: 'text',
        text: 'Please analyze the provided plant image and return a comprehensive JSON report following the exact structure specified in the system prompt.',
      });

      return content;
    } catch (error: any) {
      this.logger.error({ imageUrl, error: error.message }, 'Failed to fetch image');
      throw new Error(`Failed to fetch image: ${error.message}`);
    }
  }

  /**
   * Calculate token usage and cost - Anthropic specific pricing
   */
  private calculateTokenUsage(response: any): TokenUsage {
    const usage = response.usage || {};
    const inputTokens = usage.input_tokens || 0;
    const outputTokens = usage.output_tokens || 0;
    const totalTokens = inputTokens + outputTokens;

    // Claude 3.5 Sonnet pricing (December 2024)
    const pricing = {
      input_per_million: 3.0,   // $3 per 1M input tokens
      output_per_million: 15.0, // $15 per 1M output tokens
    };

    // Calculate costs
    const inputCostUsd = (inputTokens / 1_000_000) * pricing.input_per_million;
    const outputCostUsd = (outputTokens / 1_000_000) * pricing.output_per_million;
    const totalCostUsd = inputCostUsd + outputCostUsd;

    const usdToTry = 35; // Exchange rate
    const totalCostTry = totalCostUsd * usdToTry;

    return {
      total_tokens: totalTokens,
      prompt_tokens: inputTokens,
      completion_tokens: outputTokens,
      cost_usd: parseFloat(totalCostUsd.toFixed(6)),
      cost_try: parseFloat(totalCostTry.toFixed(4)),
    };
  }

  /**
   * Build error response when analysis fails
   */
  private buildErrorResponse(
    request: PlantAnalysisAsyncRequestDto,
    errorMessage: string,
    processingTimeMs: number,
    receivedAt: Date
  ): PlantAnalysisAsyncResponseDto {
    return {
      // Analysis results (snake_case - defaults)
      plant_identification: defaults.getDefaultPlantIdentification(),
      health_assessment: defaults.getDefaultHealthAssessment(),
      nutrient_status: defaults.getDefaultNutrientStatus(),
      pest_disease: defaults.getDefaultPestDisease(),
      environmental_stress: defaults.getDefaultEnvironmentalStress(),
      cross_factor_insights: [],
      recommendations: defaults.getDefaultRecommendations(),
      summary: defaults.getDefaultSummary(),

      // Metadata (snake_case)
      analysis_id: request.AnalysisId,
      timestamp: new Date().toISOString(),
      user_id: request.UserId,
      farmer_id: request.FarmerId,
      sponsor_id: request.SponsorId,

      // CRITICAL: PascalCase
      SponsorUserId: request.SponsorUserId,
      SponsorshipCodeId: request.SponsorshipCodeId,

      location: request.Location,
      gps_coordinates: request.GpsCoordinates,
      altitude: request.Altitude,
      field_id: request.FieldId,
      crop_type: request.CropType,
      planting_date: request.PlantingDate,
      expected_harvest_date: request.ExpectedHarvestDate,
      last_fertilization: request.LastFertilization,
      last_irrigation: request.LastIrrigation,
      previous_treatments: request.PreviousTreatments,
      weather_conditions: request.WeatherConditions,
      temperature: request.Temperature,
      humidity: request.Humidity,
      soil_type: request.SoilType,
      urgency_level: request.UrgencyLevel,
      notes: request.Notes,
      contact_info: request.ContactInfo,
      additional_info: request.AdditionalInfo,

      image_url: request.ImageUrl,
      image_path: request.ImageUrl,

      // Processing metadata (ALL PascalCase)
      processing_metadata: {
        ParseSuccess: false,
        ProcessingTimestamp: new Date().toISOString(),
        AiModel: this.modelName,
        WorkflowVersion: '2.0.0',
        ReceivedAt: receivedAt.toISOString(),
        ProcessingTimeMs: processingTimeMs,
        RetryCount: 0,
      },

      // Image metadata (ALL PascalCase)
      image_metadata: {
        URL: request.ImageUrl,
        Format: 'JPEG',
      },

      // Token usage (zero values for error)
      token_usage: {
        total_tokens: 0,
        prompt_tokens: 0,
        completion_tokens: 0,
        cost_usd: 0,
        cost_try: 0,
      },

      // Status flags
      success: false,
      error: true,
      error_message: `Anthropic API error: ${errorMessage}`,
      error_type: 'anthropic_api_error',

      // Routing metadata (from request)
      response_queue: request.ResponseQueue,
    };
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.messages.create({
        model: this.modelName,
        max_tokens: 10,
        messages: [
          {
            role: 'user',
            content: 'Hello',
          },
        ],
      });
      return !!response.content;
    } catch (error: any) {
      this.logger.error({ error: error.message }, 'Anthropic health check failed');
      return false;
    }
  }
}
