import OpenAI from 'openai';
import { ProviderConfig } from '../types/config';
import { PlantAnalysisAsyncRequestDto, PlantAnalysisAsyncResponseDto, TokenUsage } from '../types/messages';
import { Logger } from 'pino';

/**
 * OpenAI provider for plant analysis
 * CRITICAL: Returns C#-compatible PlantAnalysisAsyncResponseDto with mixed casing
 * - Analysis results: snake_case (has [JsonProperty] in C#)
 * - ProcessingMetadata: PascalCase (NO [JsonProperty] in C#)
 * - ImageMetadata: PascalCase (NO [JsonProperty] in C#)
 * - SponsorUserId/SponsorshipCodeId: PascalCase (NO [JsonProperty] in C#)
 */
export class OpenAIProvider {
  private client: OpenAI;
  private config: ProviderConfig;
  private logger: Logger;

  constructor(config: ProviderConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      timeout: config.timeout,
      maxRetries: config.retryAttempts,
    });
  }

  /**
   * Analyze plant images using OpenAI Vision API
   * Returns C#-compatible response with correct mixed casing
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
      }, 'Starting OpenAI analysis');

      // Build system prompt with Turkish analysis requirements
      const systemPrompt = this.buildSystemPrompt(request);

      // Build image content array
      const imageContent = this.buildImageContent(request);

      // Call OpenAI API
      const response = await this.client.chat.completions.create({
        model: this.config.model || 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: imageContent,
          },
        ],
        temperature: 0.7,
        max_completion_tokens: 2000,  // Changed from max_tokens to max_completion_tokens (OpenAI API update)
        response_format: { type: 'json_object' },
      });

      const analysisText = response.choices[0]?.message?.content || '';
      const processingTimeMs = Date.now() - startTime;

      // Parse AI response
      const analysisResult = JSON.parse(analysisText);

      // Calculate token usage
      const tokenUsage = this.calculateTokenUsage(response);

      this.logger.info({
        analysisId: request.AnalysisId,
        processingTimeMs,
        totalTokens: tokenUsage.total_tokens,
        costUsd: tokenUsage.cost_usd,
      }, 'OpenAI analysis completed successfully');

      // Return C#-compatible response with MIXED casing
      return {
        // ============================================
        // ANALYSIS RESULTS (snake_case - has [JsonProperty])
        // ============================================
        plant_identification: analysisResult.plant_identification || {
          species: 'Belirlenemedi',
          variety: 'Bilinmiyor',
          growth_stage: 'Belirlenemedi',
          confidence: 0,
          identifying_features: [],
          visible_parts: [],
        },
        health_assessment: analysisResult.health_assessment || {
          vigor_score: 5,
          leaf_color: 'Analiz edilemedi',
          leaf_texture: 'Analiz edilemedi',
          growth_pattern: 'Analiz edilemedi',
          structural_integrity: 'Analiz edilemedi',
          stress_indicators: [],
          disease_symptoms: [],
          severity: 'Bilinmiyor',
        },
        nutrient_status: analysisResult.nutrient_status || {
          nitrogen: 'Bilinmiyor',
          phosphorus: 'Bilinmiyor',
          potassium: 'Bilinmiyor',
          calcium: 'Bilinmiyor',
          magnesium: 'Bilinmiyor',
          sulfur: 'Bilinmiyor',
          iron: 'Bilinmiyor',
          zinc: 'Bilinmiyor',
          manganese: 'Bilinmiyor',
          boron: 'Bilinmiyor',
          copper: 'Bilinmiyor',
          molybdenum: 'Bilinmiyor',
          chlorine: 'Bilinmiyor',
          nickel: 'Bilinmiyor',
          primary_deficiency: 'Bilinmiyor',
          secondary_deficiencies: [],
          severity: 'Bilinmiyor',
        },
        pest_disease: analysisResult.pest_disease || {
          pests_detected: [],
          diseases_detected: [],
          damage_pattern: 'Analiz edilemedi',
          affected_area_percentage: 0,
          spread_risk: 'Bilinmiyor',
          primary_issue: 'Yok',
        },
        environmental_stress: analysisResult.environmental_stress || {
          water_status: 'Bilinmiyor',
          temperature_stress: 'Bilinmiyor',
          light_stress: 'Bilinmiyor',
          physical_damage: 'Bilinmiyor',
          chemical_damage: 'Bilinmiyor',
          soil_indicators: 'Bilinmiyor',
          primary_stressor: 'Yok',
        },
        cross_factor_insights: analysisResult.cross_factor_insights || [],
        recommendations: analysisResult.recommendations || {
          immediate: [],
          short_term: [],
          preventive: [],
          monitoring: [],
        },
        summary: analysisResult.summary || {
          overall_health_score: 5,
          primary_concern: 'Analiz tamamlanamadı',
          secondary_concerns: [],
          critical_issues_count: 0,
          confidence_level: 0,
          prognosis: 'Bilinmiyor',
          estimated_yield_impact: 'Bilinmiyor',
        },

        // ============================================
        // METADATA (snake_case - has [JsonProperty])
        // ============================================
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

        // ============================================
        // IMAGE URLs (snake_case - has [JsonProperty])
        // ============================================
        image_url: request.ImageUrl,
        image_path: request.ImageUrl,

        // ============================================
        // PROCESSING METADATA (PascalCase! NO [JsonProperty])
        // ============================================
        processing_metadata: {
          ParseSuccess: true,
          ProcessingTimestamp: new Date().toISOString(),
          AiModel: this.config.model || 'gpt-4o-mini',
          WorkflowVersion: '2.0.0',
          ReceivedAt: receivedAt.toISOString(),
          ProcessingTimeMs: processingTimeMs,
          RetryCount: 0,
        },

        // ============================================
        // IMAGE METADATA (PascalCase! NO [JsonProperty])
        // ============================================
        image_metadata: {
          URL: request.ImageUrl,  // CRITICAL: PascalCase!
          Format: 'JPEG',
        },

        // ============================================
        // TOKEN USAGE (snake_case - has [JsonProperty])
        // ============================================
        token_usage: tokenUsage,

        // ============================================
        // RESPONSE STATUS (snake_case - has [JsonProperty])
        // ============================================
        success: true,
        error: false,
        error_message: null,
        error_type: null,
      };
    } catch (error) {
      const processingTimeMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.logger.error({
        analysisId: request.AnalysisId,
        error: errorMessage,
        processingTimeMs,
      }, 'OpenAI analysis failed');

      return this.buildErrorResponse(request, errorMessage, processingTimeMs, receivedAt);
    }
  }

  /**
   * Build system prompt with Turkish analysis requirements
   */
  private buildSystemPrompt(request: PlantAnalysisAsyncRequestDto): string {
    return `You are an expert agricultural analyst with deep knowledge in plant pathology, nutrition, pest management, and environmental stress factors.

Your task is to analyze the provided plant image(s) and return a structured JSON report IN TURKISH.

CONTEXT INFORMATION:
- Analysis ID: ${request.AnalysisId}
- Farmer ID: ${request.FarmerId || 'Not provided'}
- Location: ${request.Location || 'Not provided'}
- Crop Type: ${request.CropType || 'Not provided'}
- Soil Type: ${request.SoilType || 'Not provided'}
- Weather: ${request.WeatherConditions || 'Not provided'}
- Temperature: ${request.Temperature || 'Not provided'}°C
- Humidity: ${request.Humidity || 'Not provided'}%

CRITICAL INSTRUCTIONS:
1. All JSON keys must remain in English exactly as provided
2. All values must be written in Turkish
3. Analyze the plant comprehensively covering ALL aspects
4. Provide confidence scores (0-100) for detections
5. Return ONLY a valid JSON object with NO additional text

Return this EXACT structure:
{
  "plant_identification": {
    "species": "Türkçe değer",
    "variety": "Türkçe değer",
    "growth_stage": "Türkçe değer",
    "confidence": 85,
    "identifying_features": ["özellik1", "özellik2"],
    "visible_parts": ["yapraklar", "gövde"]
  },
  "health_assessment": {
    "vigor_score": 7,
    "leaf_color": "Türkçe açıklama",
    "leaf_texture": "Türkçe açıklama",
    "growth_pattern": "Türkçe açıklama",
    "structural_integrity": "Türkçe açıklama",
    "stress_indicators": ["belirti1"],
    "disease_symptoms": ["belirti1"],
    "severity": "düşük|orta|yüksek|kritik"
  },
  "nutrient_status": {
    "nitrogen": "normal|eksik|fazla",
    "phosphorus": "normal|eksik|fazla",
    "potassium": "normal|eksik|fazla",
    "calcium": "normal|eksik|fazla",
    "magnesium": "normal|eksik|fazla",
    "sulfur": "normal|eksik|fazla",
    "iron": "normal|eksik|fazla",
    "zinc": "normal|eksik|fazla",
    "manganese": "normal|eksik|fazla",
    "boron": "normal|eksik|fazla",
    "copper": "normal|eksik|fazla",
    "molybdenum": "normal|eksik|fazla",
    "chlorine": "normal|eksik|fazla",
    "nickel": "normal|eksik|fazla",
    "primary_deficiency": "ana eksiklik veya yok",
    "secondary_deficiencies": [],
    "severity": "düşük|orta|yüksek"
  },
  "pest_disease": {
    "pests_detected": [{"type": "adı", "category": "kategori", "severity": "düşük|orta|yüksek", "affected_parts": [], "confidence": 85}],
    "diseases_detected": [{"type": "adı", "category": "fungal|bakteriyel|viral", "severity": "düşük|orta|yüksek", "affected_parts": [], "confidence": 85}],
    "damage_pattern": "açıklama",
    "affected_area_percentage": 25,
    "spread_risk": "düşük|orta|yüksek",
    "primary_issue": "ana sorun"
  },
  "environmental_stress": {
    "water_status": "optimal|kurak|fazla",
    "temperature_stress": "yok|sıcak|soğuk",
    "light_stress": "yok|yetersiz|aşırı",
    "physical_damage": "yok|var - detay",
    "chemical_damage": "yok|var - detay",
    "soil_indicators": "açıklama",
    "primary_stressor": "ana stres"
  },
  "cross_factor_insights": [{"insight": "açıklama", "confidence": 0.85, "affected_aspects": [], "impact_level": "düşük|orta|yüksek"}],
  "recommendations": {
    "immediate": [{"action": "ne yapılmalı", "details": "detay", "timeline": "zaman", "priority": "kritik|yüksek|orta"}],
    "short_term": [{"action": "ne yapılmalı", "details": "detay", "timeline": "zaman", "priority": "yüksek|orta"}],
    "preventive": [{"action": "önlem", "details": "detay", "timeline": "sürekli", "priority": "orta"}],
    "monitoring": [{"parameter": "parametre", "frequency": "sıklık", "threshold": "eşik"}]
  },
  "summary": {
    "overall_health_score": 7,
    "primary_concern": "en kritik sorun",
    "secondary_concerns": ["diğer sorunlar"],
    "critical_issues_count": 2,
    "confidence_level": 85,
    "prognosis": "mükemmel|iyi|orta|zayıf|kritik",
    "estimated_yield_impact": "minimal|orta|önemli"
  }
}`;
  }

  /**
   * Build image content array for OpenAI Vision API
   */
  private buildImageContent(request: PlantAnalysisAsyncRequestDto): any[] {
    const content: any[] = [
      {
        type: 'text',
        text: 'Analyze this plant image comprehensively',
      },
    ];

    // Add main image URL
    if (request.ImageUrl) {
      content.push({
        type: 'image_url',
        image_url: {
          url: request.ImageUrl,
          detail: 'high',
        },
      });
    }

    return content;
  }

  /**
   * Calculate token usage and cost
   */
  private calculateTokenUsage(response: any): TokenUsage {
    const usage = response.usage || {};
    const inputTokens = usage.prompt_tokens || 0;
    const outputTokens = usage.completion_tokens || 0;
    const totalTokens = usage.total_tokens || inputTokens + outputTokens;

    // gpt-4o-mini pricing
    const pricing = {
      input_per_million: 0.150,   // $0.150/M input tokens
      output_per_million: 0.600,  // $0.600/M output tokens
    };

    const inputCostUsd = (inputTokens / 1_000_000) * pricing.input_per_million;
    const outputCostUsd = (outputTokens / 1_000_000) * pricing.output_per_million;
    const totalCostUsd = inputCostUsd + outputCostUsd;

    const usdToTry = 35;  // Exchange rate
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
   * Build error response for failed analyses
   */
  private buildErrorResponse(
    request: PlantAnalysisAsyncRequestDto,
    errorMessage: string,
    processingTimeMs: number,
    receivedAt: Date
  ): PlantAnalysisAsyncResponseDto {
    return {
      // Analysis results (default values)
      plant_identification: {
        species: 'Belirlenemedi',
        variety: 'Bilinmiyor',
        growth_stage: 'Belirlenemedi',
        confidence: 0,
        identifying_features: [],
        visible_parts: [],
      },
      health_assessment: {
        vigor_score: 0,
        leaf_color: 'Analiz edilemedi',
        leaf_texture: 'Analiz edilemedi',
        growth_pattern: 'Analiz edilemedi',
        structural_integrity: 'Analiz edilemedi',
        stress_indicators: [],
        disease_symptoms: [],
        severity: 'Bilinmiyor',
      },
      nutrient_status: {
        nitrogen: 'Bilinmiyor',
        phosphorus: 'Bilinmiyor',
        potassium: 'Bilinmiyor',
        calcium: 'Bilinmiyor',
        magnesium: 'Bilinmiyor',
        sulfur: 'Bilinmiyor',
        iron: 'Bilinmiyor',
        zinc: 'Bilinmiyor',
        manganese: 'Bilinmiyor',
        boron: 'Bilinmiyor',
        copper: 'Bilinmiyor',
        molybdenum: 'Bilinmiyor',
        chlorine: 'Bilinmiyor',
        nickel: 'Bilinmiyor',
        primary_deficiency: 'Bilinmiyor',
        secondary_deficiencies: [],
        severity: 'Bilinmiyor',
      },
      pest_disease: {
        pests_detected: [],
        diseases_detected: [],
        damage_pattern: 'Analiz edilemedi',
        affected_area_percentage: 0,
        spread_risk: 'Bilinmiyor',
        primary_issue: 'Analiz başarısız',
      },
      environmental_stress: {
        water_status: 'Bilinmiyor',
        temperature_stress: 'Bilinmiyor',
        light_stress: 'Bilinmiyor',
        physical_damage: 'Bilinmiyor',
        chemical_damage: 'Bilinmiyor',
        soil_indicators: 'Bilinmiyor',
        primary_stressor: 'OpenAI hatası',
      },
      cross_factor_insights: [],
      recommendations: {
        immediate: [],
        short_term: [],
        preventive: [],
        monitoring: [],
      },
      summary: {
        overall_health_score: 0,
        primary_concern: 'Analiz başarısız',
        secondary_concerns: [errorMessage],
        critical_issues_count: 0,
        confidence_level: 0,
        prognosis: 'Bilinmiyor',
        estimated_yield_impact: 'Bilinmiyor',
      },

      // Metadata
      analysis_id: request.AnalysisId,
      timestamp: new Date().toISOString(),
      user_id: request.UserId,
      farmer_id: request.FarmerId,
      sponsor_id: request.SponsorId,
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

      // Processing metadata (PascalCase!)
      processing_metadata: {
        ParseSuccess: false,
        ProcessingTimestamp: new Date().toISOString(),
        AiModel: this.config.model || 'gpt-4o-mini',
        WorkflowVersion: '2.0.0',
        ReceivedAt: receivedAt.toISOString(),
        ProcessingTimeMs: processingTimeMs,
        RetryCount: 0,
      },

      // Image metadata (PascalCase!)
      image_metadata: {
        URL: request.ImageUrl,
      },

      // Response status
      success: false,
      error: true,
      error_message: errorMessage,
      error_type: 'openai_error',
    };
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.client.models.list();
      return true;
    } catch (error) {
      this.logger.error({ error }, 'OpenAI health check failed');
      return false;
    }
  }
}
