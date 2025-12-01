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
      // CRITICAL: For vision models, ALL content (text + images) must be in SINGLE user message
      // System role doesn't support image_url content parts
      // Using official OpenAI API - model must be gpt-4o-mini (vision capable)
      const response = await this.client.chat.completions.create({
        model: this.config.model || 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: systemPrompt,
              },
              ...imageContent.filter((item: any) => item.type === 'image_url'),  // Only include image_url items
            ],
          },
        ],
        max_completion_tokens: 2000,
      });

      const analysisText = response.choices[0]?.message?.content || '';
      const processingTimeMs = Date.now() - startTime;

      // Validate response content
      if (!analysisText || analysisText.trim().length === 0) {
        throw new Error('OpenAI returned empty response');
      }

      this.logger.debug({
        analysisId: request.AnalysisId,
        responseLength: analysisText.length,
        responsePreview: analysisText.substring(0, 200),
      }, 'OpenAI raw response received');

      // Parse AI response with N8N cleanup logic (lines 86-97 from parse_node.js)
      let analysisResult: any;
      try {
        // Clean markdown code blocks and extract JSON (matching N8N parse_node.js)
        let cleanedOutput = analysisText;
        cleanedOutput = cleanedOutput.replace(/```json\n?/g, '');  // Remove ```json
        cleanedOutput = cleanedOutput.replace(/```\n?/g, '');      // Remove ```

        const jsonStart = cleanedOutput.indexOf('{');
        const jsonEnd = cleanedOutput.lastIndexOf('}') + 1;

        if (jsonStart === -1 || jsonEnd === 0) {
          throw new Error('No JSON structure found in response');
        }

        const jsonStr = cleanedOutput.substring(jsonStart, jsonEnd);

        this.logger.debug({
          analysisId: request.AnalysisId,
          originalLength: analysisText.length,
          cleanedLength: jsonStr.length,
          hadMarkdown: analysisText.includes('```'),
        }, 'JSON cleanup completed');

        analysisResult = JSON.parse(jsonStr);
      } catch (parseError) {
        this.logger.error({
          analysisId: request.AnalysisId,
          parseError: parseError instanceof Error ? parseError.message : 'Unknown parse error',
          responseLength: analysisText.length,
          responseStart: analysisText.substring(0, 500),
          responseEnd: analysisText.substring(Math.max(0, analysisText.length - 500)),
        }, 'Failed to parse OpenAI JSON response');
        throw new Error(`JSON parse failed: ${parseError instanceof Error ? parseError.message : 'Unknown error'}. Response length: ${analysisText.length}`);
      }

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
   * Based on N8N production workflow prompt
   */
  private buildSystemPrompt(request: PlantAnalysisAsyncRequestDto): string {
    const contextInfo = `Analysis ID: ${request.AnalysisId}
Farmer ID: ${request.FarmerId || 'Not provided'}
Location: ${request.Location || 'Not provided'}
GPS Coordinates: ${request.GpsCoordinates ? JSON.stringify(request.GpsCoordinates) : 'Not provided'}
Altitude: ${request.Altitude || 'Not provided'} meters
Field ID: ${request.FieldId || 'Not provided'}
Crop Type: ${request.CropType || 'Not provided'}
Planting Date: ${request.PlantingDate || 'Not provided'}
Expected Harvest: ${request.ExpectedHarvestDate || 'Not provided'}
Soil Type: ${request.SoilType || 'Not provided'}
Last Fertilization: ${request.LastFertilization || 'Not provided'}
Last Irrigation: ${request.LastIrrigation || 'Not provided'}
Weather Conditions: ${request.WeatherConditions || 'Not provided'}
Temperature: ${request.Temperature || 'Not provided'}°C
Humidity: ${request.Humidity || 'Not provided'}%
Previous Treatments: ${request.PreviousTreatments && request.PreviousTreatments.length > 0 ? JSON.stringify(request.PreviousTreatments) : 'None'}
Urgency Level: ${request.UrgencyLevel || 'Not provided'}
Notes from Farmer: ${request.Notes || 'None'}`;

    return `You are an expert agricultural analyst with deep knowledge in plant pathology, nutrition (macro and micro elements), pest management, physiological disorders, soil science, and environmental stress factors.

Your task is to analyze the provided plant image comprehensively and return a structured JSON report.

============================================
IMPORTANT INSTRUCTIONS
============================================

All JSON keys must remain in English exactly as provided.

All values must be written in Turkish (e.g., species name, disease description, nutrient status, stress factors, recommendations, summaries, etc.).

Do not mix languages: keys stay in English, values are always Turkish.

Always:

Cross-check visible symptoms with provided environmental, soil, and treatment data.

Distinguish between biotic (pests, diseases) and abiotic (nutrient, environmental, physiological) stress.

Provide confidence scores (0–100) for each major detection.

If information is insufficient or ambiguous, explicitly state uncertainty and suggest what extra farmer input is needed (in Turkish).

Adapt recommendations to regional conditions if location data is available.

Include both scientific explanations and a plain farmer-friendly summary in Turkish.

Provide organic and chemical management options where relevant.

CONTEXT INFORMATION PROVIDED:

${contextInfo}

Perform a complete analysis covering ALL of the following aspects:

(analysis categories same as before, but values must be produced in Turkish)

Return ONLY a valid JSON object with this EXACT structure (no additional text):
{
  "plant_identification": {
    "species": "Türkçe değer",
    "variety": "Türkçe değer veya bilinmiyor",
    "growth_stage": "fide|vejetatif|çiçeklenme|meyve",
    "confidence": 0-100,
    "identifying_features": ["özellik1", "özellik2"],
    "visible_parts": ["yapraklar", "gövde", "çiçekler", "meyveler", "kökler"]
  },
  "health_assessment": {
    "vigor_score": 1-10,
    "leaf_color": "Türkçe açıklama",
    "leaf_texture": "Türkçe açıklama",
    "growth_pattern": "normal|anormal - detay",
    "structural_integrity": "sağlam|orta|zayıf - detay",
    "stress_indicators": ["belirti1", "belirti2"],
    "disease_symptoms": ["belirti1", "belirti2"],
    "severity": "yok|düşük|orta|yüksek|kritik"
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
    "secondary_deficiencies": ["eksiklik1", "eksiklik2"],
    "severity": "yok|düşük|orta|yüksek|kritik"
  },
  "pest_disease": {
    "pests_detected": [
      {"type": "zararlı adı", "group": "böcek|akar|nematod|kemirgen|diğer", "severity": "düşük|orta|yüksek", "confidence": 0-100, "location": "bitkinin bölgesi"}
    ],
    "diseases_detected": [
      {"type": "hastalık adı", "category": "fungal|bakteriyel|viral|fizyolojik", "severity": "düşük|orta|yüksek", "affected_parts": ["etkilenen kısımlar"], "confidence": 0-100}
    ],
    "damage_pattern": "zarar deseni açıklaması",
    "affected_area_percentage": 0-100,
    "spread_risk": "yok|düşük|orta|yüksek",
    "primary_issue": "ana sorun veya yok"
  },
  "environmental_stress": {
    "water_status": "optimal|hafif kurak|kurak|hafif fazla|su baskını",
    "temperature_stress": "yok|hafif sıcak|aşırı sıcak|hafif soğuk|aşırı soğuk",
    "light_stress": "yok|yetersiz|aşırı",
    "physical_damage": "yok|rüzgar|dolu|mekanik|hayvan",
    "chemical_damage": "yok|şüpheli|kesin - detay",
    "soil_indicators": "toprak sağlığı göstergeleri açıklaması (tuzluluk, pH, organik madde)",
    "primary_stressor": "ana stres faktörü veya yok"
  },
  "cross_factor_insights": [
    {
      "insight": "faktörler arası ilişki açıklaması",
      "confidence": 0.0-1.0,
      "affected_aspects": ["alan1", "alan2"],
      "impact_level": "düşük|orta|yüksek"
    }
  ],
  "risk_assessment": {
    "yield_loss_probability": "düşük|orta|yüksek",
    "timeline_to_worsen": "gün|hafta",
    "spread_potential": "yok|lokal|tarlanın geneli"
  },
  "recommendations": {
    "immediate": [
      {"action": "ne yapılmalı", "details": "özel talimat", "timeline": "X saat içinde", "priority": "kritik|yüksek|orta"}
    ],
    "short_term": [
      {"action": "ne yapılmalı", "details": "özel talimat", "timeline": "X-Y gün", "priority": "yüksek|orta|düşük"}
    ],
    "preventive": [
      {"action": "önlem", "details": "özel talimat", "timeline": "sürekli", "priority": "orta|düşük"}
    ],
    "monitoring": [
      {"parameter": "izlenecek parametre", "frequency": "sıklık", "threshold": "tetikleyici eşik"}
    ],
    "resource_estimation": {
      "water_required_liters": "litre cinsinden",
      "fertilizer_cost_estimate_usd": "maliyet $",
      "labor_hours_estimate": "saat"
    },
    "localized_recommendations": {
      "region": "bölge adı",
      "preferred_practices": ["uygulama1", "uygulama2"],
      "restricted_methods": ["yasaklı yöntem1", "yasaklı yöntem2"]
    }
  },
  "summary": {
    "overall_health_score": 1-10,
    "primary_concern": "en kritik sorun",
    "secondary_concerns": ["diğer önemli sorunlar"],
    "critical_issues_count": 0-N,
    "confidence_level": 0-100,
    "prognosis": "mükemmel|iyi|orta|zayıf|kritik",
    "estimated_yield_impact": "yok|minimal|orta|önemli|çok ciddi"
  },
  "confidence_notes": [
    {"aspect": "nutrient_status", "confidence": 0.85, "reason": "Türkçe açıklama"}
  ],
  "farmer_friendly_summary": "Çiftçi için sade Türkçe açıklama."
}`;
  }

  /**
   * Build image content array for OpenAI Vision API
   * Returns only image_url items (text is added separately in main message)
   */
  private buildImageContent(request: PlantAnalysisAsyncRequestDto): any[] {
    const content: any[] = [];

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
