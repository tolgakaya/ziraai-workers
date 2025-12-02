/**
 * Gemini AI Provider Implementation
 *
 * C#-compatible implementation for WebAPI V2 integration
 * Uses PlantAnalysisAsyncRequestDto/ResponseDto with correct casing
 *
 * Model: gemini-2.0-flash-exp
 * Pricing: Input $0.075/M, Output $0.30/M
 */

import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { PlantAnalysisAsyncRequestDto, PlantAnalysisAsyncResponseDto, TokenUsage } from '../types/messages';
import pino from 'pino';
import * as defaults from './defaults';

export class GeminiProvider {
  private client: GoogleGenerativeAI;
  private model: GenerativeModel;
  private modelName: string;
  private logger: pino.Logger;

  constructor(apiKey: string, logger: pino.Logger, model?: string) {
    this.client = new GoogleGenerativeAI(apiKey);
    this.modelName = model || 'gemini-2.0-flash-exp';
    this.model = this.client.getGenerativeModel({ model: this.modelName });
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
      }, 'Starting Gemini analysis');

      const systemPrompt = this.buildSystemPrompt(request);
      const imagePart = await this.buildImagePart(request.ImageUrl);

      // Gemini uses different structure: parts array with text and inlineData
      const parts = [
        { text: systemPrompt },
        imagePart,
      ];

      this.logger.debug({
        analysisId: request.AnalysisId,
        model: this.modelName,
      }, 'Calling Gemini API');

      const geminiResult = await this.model.generateContent({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2000,
          responseMimeType: 'application/json',
        },
      });

      const response = await geminiResult.response;
      const analysisText = response.text();
      const processingTimeMs = Date.now() - startTime;

      // CRITICAL: Validate response content
      if (!analysisText || analysisText.trim().length === 0) {
        this.logger.error({
          analysisId: request.AnalysisId,
          fullResponse: JSON.stringify(response),
        }, 'Empty response - full API response logged');
        throw new Error('Gemini returned empty response');
      }

      this.logger.debug({
        analysisId: request.AnalysisId,
        responseLength: analysisText.length,
        responsePreview: analysisText.substring(0, 200),
      }, 'Gemini raw response received');

      // Parse AI response with N8N cleanup logic (matching OpenAI provider)
      let analysisResult: any;
      try {
        // Clean markdown code blocks and extract JSON (matching OpenAI provider)
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
        }, 'Failed to parse Gemini JSON response');
        throw new Error(`JSON parse failed: ${parseError instanceof Error ? parseError.message : 'Unknown error'}. Response length: ${analysisText.length}`);
      }
      const tokenUsage = this.calculateTokenUsage(response);

      this.logger.info({
        analysisId: request.AnalysisId,
        processingTimeMs,
        totalTokens: tokenUsage.total_tokens,
        costUsd: tokenUsage.cost_usd,
      }, 'Gemini analysis completed successfully');

      // N8N MATCH: Merge ALL AI fields (matching OpenAI provider logic)
      // This preserves ALL fields from AI response (including risk_assessment, confidence_notes, farmer_friendly_summary)
      const responseDto = {
        // FIRST: Spread ALL AI analysis results (this gets everything: risk_assessment, confidence_notes, farmer_friendly_summary, etc.)
        ...analysisResult,

        // THEN: Add/override with defaults ONLY if sections are missing
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
          AiModel: this.modelName,
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

        // ============================================
        // ROUTING METADATA (from request)
        // ============================================
        response_queue: request.ResponseQueue,
      };

      return responseDto;
    } catch (error: any) {
      const processingTimeMs = Date.now() - startTime;
      const errorMessage = error?.message || 'Unknown Gemini API error';

      this.logger.error({
        analysisId: request.AnalysisId,
        error: errorMessage,
        processingTimeMs,
      }, 'Gemini analysis failed');

      return this.buildErrorResponse(request, errorMessage, processingTimeMs, receivedAt);
    }
  }

  /**
   * Build system prompt with Turkish analysis requirements
   * EXACT COPY FROM OpenAI provider - MUST STAY IDENTICAL
   */
  private buildSystemPrompt(request: PlantAnalysisAsyncRequestDto): string {
    // EXACT COPY FROM OpenAI provider (openai.provider.ts buildSystemPrompt)
    return `You are an expert agricultural analyst with deep knowledge in plant pathology, nutrition (macro and micro elements), pest management, physiological disorders, soil science, and environmental stress factors.

Your task is to analyze the provided plant image(s) comprehensively and return a structured JSON report.

============================================
MULTI-IMAGE ANALYSIS (if additional images provided)
============================================

You may receive UP TO 4 DIFFERENT IMAGES of the same plant. Analyze all provided images together for a more comprehensive diagnosis:

**MAIN IMAGE:** ${request.ImageUrl}
This is the primary image for analysis.

${(request as any).LeafTopImage ? `**LEAF TOP IMAGE (Yaprağın Üst Yüzeyi):** ${(request as any).LeafTopImage}\nFocus on: Upper leaf surface symptoms, color variations, spots, lesions, powdery mildew, rust, insect feeding damage, nutrient deficiency patterns (interveinal chlorosis, etc.)\n` : ''}${(request as any).LeafBottomImage ? `**LEAF BOTTOM IMAGE (Yaprağın Alt Yüzeyi):** ${(request as any).LeafBottomImage}\nFocus on: Aphid colonies, whiteflies and eggs, spider mites and webs, downy mildew spores, rust pustules, scale insects, stomatal abnormalities\n` : ''}${(request as any).PlantOverviewImage ? `**PLANT OVERVIEW IMAGE (Bitkinin Genel Görünümü):** ${(request as any).PlantOverviewImage}\nFocus on: Overall plant vigor, stunting, wilting patterns, vascular wilt symptoms (one-sided wilting), stem structure, branching pattern, fruit/flower status\n` : ''}${(request as any).RootImage ? `**ROOT IMAGE (Kök Resmi):** ${(request as any).RootImage}\nFocus on: Root color (healthy white vs brown/black rotted), root-knot nematode galling, root rot lesions, root development, fibrous root density, soil-borne disease symptoms\n` : ''}

**MULTI-IMAGE ANALYSIS INSTRUCTIONS:**
- Analyze ALL provided images together for comprehensive diagnosis
- Cross-reference findings between images to confirm or rule out issues
- If symptoms appear in multiple images, this increases diagnostic confidence
- Note any contradictions between different image observations
- If only the main image is provided, base your analysis solely on it
- Total images provided: ${(request as any).ImageMetadata?.TotalImages || 1}
- Available images: ${(request as any).ImageMetadata?.ImagesProvided?.join(', ') || 'main image'}

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

Analysis ID: ${request.AnalysisId}

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

Urgency Level: ${request.UrgencyLevel}

Notes from Farmer: ${request.Notes || 'None'}

Perform a complete analysis covering ALL of the following aspects:

(analysis categories same as before, but values must be produced in Turkish)

Analyze this image: ${request.ImageUrl}

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
    "physiological_disorders": [
      {"type": "güneş yanığı|tuz zararı|don zararı|herbisit zararı|besin toksisitesi", "severity": "düşük|orta|yüksek", "notes": "detaylar"}
    ],
    "soil_health_indicators": {
      "salinity": "yok|hafif|orta|şiddetli",
      "pH_issue": "asidik|alkali|optimal",
      "organic_matter": "düşük|orta|yüksek"
    },
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
   * Build image part for Gemini API
   * Gemini uses inlineData format with base64 encoding
   */
  private async buildImagePart(imageUrl: string): Promise<any> {
    try {
      // Fetch image and convert to base64
      const response = await fetch(imageUrl);
      const buffer = await response.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      const mimeType = response.headers.get('content-type') || 'image/jpeg';

      return {
        inlineData: {
          mimeType,
          data: base64,
        },
      };
    } catch (error: any) {
      this.logger.error({ imageUrl, error: error.message }, 'Failed to fetch image');
      throw new Error(`Failed to fetch image: ${error.message}`);
    }
  }

  /**
   * Calculate token usage and cost - Gemini specific pricing
   */
  private calculateTokenUsage(response: any): TokenUsage {
    const usage = response.usageMetadata || {};
    const inputTokens = usage.promptTokenCount || 0;
    const outputTokens = usage.candidatesTokenCount || 0;
    const totalTokens = usage.totalTokenCount || inputTokens + outputTokens;

    // Gemini Flash 2.0 pricing (December 2024)
    const pricing = {
      input_per_million: 0.075, // $0.075 per 1M input tokens
      output_per_million: 0.3,   // $0.30 per 1M output tokens
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
      error_message: `Gemini API error: ${errorMessage}`,
      error_type: 'gemini_api_error',

      // Routing metadata (from request)
      response_queue: request.ResponseQueue,
    };
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Simple generation test
      const result = await this.model.generateContent({
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
        generationConfig: {
          maxOutputTokens: 10,
        },
      });
      return !!result.response;
    } catch (error: any) {
      this.logger.error({ error: error.message }, 'Gemini health check failed');
      return false;
    }
  }
}
