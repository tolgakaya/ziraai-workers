// =============================================================================
// ZiraAI - OpenAI GPT-5-mini Worker Implementation
// n8n flow'una tam uyumlu TypeScript implementasyonu
// =============================================================================

import OpenAI from 'openai';

// =============================================================================
// TYPES
// =============================================================================

export interface AnalysisRequest {
  analysis_id: string;
  timestamp: string;
  
  // Images
  leaf_top_url?: string;
  leaf_bottom_url?: string;
  plant_overview_url?: string;
  root_url?: string;
  image_url?: string; // backward compatibility
  
  // User identification
  farmer_id?: string;
  sponsor_id?: string;
  
  // Location data
  location?: string;
  gps_coordinates?: { lat: number; lng: number };
  altitude?: number;
  
  // Field and crop information
  field_id?: string;
  crop_type?: string;
  planting_date?: string;
  expected_harvest_date?: string;
  
  // Agricultural practices
  last_fertilization?: string;
  last_irrigation?: string;
  previous_treatments?: string[];
  
  // Environmental conditions
  weather_conditions?: string;
  temperature?: number;
  humidity?: number;
  soil_type?: string;
  
  // Additional info
  urgency_level?: 'low' | 'normal' | 'high' | 'critical';
  notes?: string;
  contact_info?: string;
  additional_info?: Record<string, any>;
  
  // Image metadata
  image_metadata?: {
    source: string;
    image_count: number;
    images_provided: string[];
    total_images?: number;
    leaf_top_url?: string;
    leaf_bottom_url?: string;
    plant_overview_url?: string;
    root_url?: string;
    upload_timestamp?: string;
  };
  
  // Internal routing
  _routing?: {
    provider: string;
    dispatchedAt: number;
    rateWindow: number;
  };
  _retryCount?: number;
}

export interface AnalysisResult {
  plant_identification: {
    species: string;
    variety: string;
    growth_stage: string;
    confidence: number;
    identifying_features: string[];
    visible_parts: string[];
    identification_sources: string[];
  };
  image_analysis: {
    leaf_top: ImageAnalysisResult;
    leaf_bottom: ImageAnalysisResult;
    plant_overview: PlantOverviewResult;
    root: RootAnalysisResult;
    cross_image_correlation: CrossImageCorrelation;
  };
  health_assessment: HealthAssessment;
  nutrient_status: NutrientStatus;
  pest_disease: PestDiseaseAssessment;
  environmental_stress: EnvironmentalStress;
  cross_factor_insights: CrossFactorInsight[];
  risk_assessment: RiskAssessment;
  recommendations: Recommendations;
  summary: AnalysisSummary;
  confidence_notes: ConfidenceNote[];
  farmer_friendly_summary: string;
}

interface ImageAnalysisResult {
  analyzed: boolean;
  image_quality: string;
  findings: string[];
  symptoms_detected: string[];
  abnormalities: string[];
  confidence: number;
  notes: string;
}

interface PlantOverviewResult extends ImageAnalysisResult {
  growth_assessment: string;
  wilting_pattern: string;
}

interface RootAnalysisResult extends ImageAnalysisResult {
  root_health: string;
  root_color: string;
  galling_present: boolean;
}

interface CrossImageCorrelation {
  confirmed_diagnoses: Array<{
    diagnosis: string;
    supporting_images: string[];
    confidence_boost: string;
  }>;
  conflicting_observations: string[];
  diagnosis_requiring_more_images: string[];
  recommended_additional_images: string[];
}

interface HealthAssessment {
  vigor_score: number;
  leaf_color: string;
  leaf_texture: string;
  growth_pattern: string;
  structural_integrity: string;
  stress_indicators: string[];
  disease_symptoms: string[];
  severity: string;
  assessment_based_on: string[];
}

interface NutrientStatus {
  nitrogen: string;
  phosphorus: string;
  potassium: string;
  calcium: string;
  magnesium: string;
  sulfur: string;
  iron: string;
  zinc: string;
  manganese: string;
  boron: string;
  copper: string;
  molybdenum: string;
  chlorine: string;
  nickel: string;
  primary_deficiency: string;
  secondary_deficiencies: string[];
  severity: string;
  visual_indicators_by_image: {
    leaf_top_indicators: string[];
    leaf_bottom_indicators: string[];
    root_indicators: string[];
  };
}

interface PestDiseaseAssessment {
  pests_detected: Array<{
    type: string;
    group: string;
    severity: string;
    confidence: number;
    location: string;
    detected_in_images: string[];
    life_stage_observed: string;
  }>;
  diseases_detected: Array<{
    type: string;
    category: string;
    severity: string;
    affected_parts: string[];
    confidence: number;
    detected_in_images: string[];
    progression_stage: string;
  }>;
  damage_pattern: string;
  affected_area_percentage: number;
  spread_risk: string;
  primary_issue: string;
  root_specific_issues: {
    root_rot_detected: boolean;
    nematode_damage: boolean;
    soil_borne_pathogens: string[];
  };
}

interface EnvironmentalStress {
  water_status: string;
  temperature_stress: string;
  light_stress: string;
  physical_damage: string;
  chemical_damage: string;
  physiological_disorders: Array<{
    type: string;
    severity: string;
    notes: string;
    visible_in_images: string[];
  }>;
  soil_health_indicators: {
    salinity: string;
    pH_issue: string;
    organic_matter: string;
    compaction_signs: string;
  };
  primary_stressor: string;
}

interface CrossFactorInsight {
  insight: string;
  confidence: number;
  affected_aspects: string[];
  impact_level: string;
  supporting_evidence_from_images: string[];
}

interface RiskAssessment {
  yield_loss_probability: string;
  timeline_to_worsen: string;
  spread_potential: string;
  root_system_risk: string;
}

interface Recommendations {
  immediate: Array<{
    action: string;
    details: string;
    timeline: string;
    priority: string;
    based_on_finding: string;
  }>;
  short_term: Array<{
    action: string;
    details: string;
    timeline: string;
    priority: string;
  }>;
  preventive: Array<{
    action: string;
    details: string;
    timeline: string;
    priority: string;
  }>;
  monitoring: Array<{
    parameter: string;
    frequency: string;
    threshold: string;
  }>;
  root_care: Array<{
    action: string;
    details: string;
    reason: string;
  }>;
  resource_estimation: {
    water_required_liters: string;
    fertilizer_cost_estimate_usd: string;
    labor_hours_estimate: string;
  };
  localized_recommendations: {
    region: string;
    preferred_practices: string[];
    restricted_methods: string[];
  };
}

interface AnalysisSummary {
  overall_health_score: number;
  primary_concern: string;
  secondary_concerns: string[];
  critical_issues_count: number;
  confidence_level: number;
  prognosis: string;
  estimated_yield_impact: string;
  images_analyzed_count: number;
  analysis_completeness: string;
}

interface ConfidenceNote {
  aspect: string;
  confidence: number;
  reason: string;
  could_improve_with: string;
}

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface AnalysisResponse {
  result: AnalysisResult;
  token_usage: TokenUsage;
  model: string;
  processing_time_ms: number;
}

// =============================================================================
// OPENAI PROVIDER CLASS
// =============================================================================

export class OpenAIAnalysisProvider {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string = 'gpt-5-mini') {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  /**
   * Ana analiz fonksiyonu - n8n flow'undaki AI Agent'ın yaptığı işi yapar
   */
  async analyze(request: AnalysisRequest): Promise<AnalysisResponse> {
    const startTime = Date.now();
    
    // Prompt'u oluştur
    const prompt = this.buildPrompt(request);
    
    // Image content'lerini oluştur
    const imageContents = this.buildImageContents(request);
    
    // API çağrısı
    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: 5000,
      temperature: 0.3, // Daha tutarlı sonuçlar için düşük temperature
      response_format: { type: 'json_object' }, // JSON response garantisi
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            ...imageContents
          ]
        }
      ]
    });

    const processingTime = Date.now() - startTime;
    
    // Response'u parse et
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI');
    }

    let result: AnalysisResult;
    try {
      result = JSON.parse(content);
    } catch (parseError) {
      throw new Error(`Failed to parse OpenAI response as JSON: ${parseError}`);
    }

    return {
      result,
      token_usage: {
        prompt_tokens: response.usage?.prompt_tokens || 0,
        completion_tokens: response.usage?.completion_tokens || 0,
        total_tokens: response.usage?.total_tokens || 0
      },
      model: this.model,
      processing_time_ms: processingTime
    };
  }

  /**
   * n8n flow'undaki prompt'un birebir TypeScript versiyonu
   */
  private buildPrompt(request: AnalysisRequest): string {
    // Image metadata hesapla
    const imagesProvided: string[] = [];
    if (request.leaf_top_url) imagesProvided.push('leaf_top');
    if (request.leaf_bottom_url) imagesProvided.push('leaf_bottom');
    if (request.plant_overview_url) imagesProvided.push('plant_overview');
    if (request.root_url) imagesProvided.push('root');
    
    const imageCount = imagesProvided.length;

    return `You are an expert agricultural analyst with deep knowledge in plant pathology, nutrition (macro and micro elements), pest management, physiological disorders, soil science, and environmental stress factors.

Your task is to analyze the provided plant images comprehensively and return a structured JSON report.

============================================
MULTI-IMAGE ANALYSIS INSTRUCTIONS
============================================

You will receive UP TO 4 DIFFERENT IMAGES of the same plant from different perspectives. Analyze each provided image carefully and cross-reference findings between them for more accurate diagnosis.

**IMAGE 1 - LEAF TOP (Yaprağın Üst Yüzeyi):** ${request.leaf_top_url || 'Not provided'}
When analyzing the leaf top image, focus on:
- Üst yaprak yüzeyindeki renk değişimleri ve kloroz desenleri
- Leke, lezyon ve nekrotik alanlar
- Külleme gibi fungal oluşumlar
- Pas hastalığı belirtileri (üst yüzey)
- Böcek beslenme zararları ve yaprak delikleri
- Yaprak kenarı yanıkları ve kıvrılmaları
- Besin eksikliği belirtileri (interveinal chlorosis, vb.)

**IMAGE 2 - LEAF BOTTOM (Yaprağın Alt Yüzeyi):** ${request.leaf_bottom_url || 'Not provided'}
When analyzing the leaf bottom image, focus on:
- Yaprak biti (aphid) kolonileri
- Beyazsinek ve yumurtaları
- Kırmızı örümcek (spider mite) ve ağları
- Mildiyö sporları ve belirtileri
- Pas hastalığı pustülleri
- Kabuklubit ve unlubit varlığı
- Stoma anormallikleri
- Yaprak altı damar yapısındaki değişimler

**IMAGE 3 - PLANT OVERVIEW (Bitkinin Genel Görünümü):** ${request.plant_overview_url || 'Not provided'}
When analyzing the plant overview image, focus on:
- Genel bitki canlılığı ve vigor durumu
- Boy gelişimi ve bodurlaşma
- Yaprak düşümü ve solgunluk desenleri
- Vasküler solgunluk belirtileri (tek taraflı solma)
- Gövde yapısı ve mekanik hasarlar
- Dallanma deseni ve şekil bozuklukları
- Meyve/çiçek durumu
- Bitki popülasyonundaki homojenlik

**IMAGE 4 - ROOT (Kök Resmi):** ${request.root_url || 'Not provided'}
When analyzing the root image, focus on:
- Kök rengi (sağlıklı beyaz vs. kahverengi/siyah çürümüş)
- Kök ur nematodu (galling) belirtileri
- Kök çürüklüğü lezyonları
- Kök gelişimi ve yayılımı
- Saçak kök yoğunluğu
- Toprak kaynaklı hastalık belirtileri
- Kök boğazı hastalıkları
- Mikorizal kolonizasyon işaretleri

**CROSS-IMAGE ANALYSIS APPROACH:**
- Analyze EACH PROVIDED IMAGE separately first, noting specific findings
- CROSS-REFERENCE findings between images to confirm or rule out diagnoses
- If symptoms appear in multiple images, INCREASE confidence score
- Note when findings from different images CONTRADICT each other
- If only some images are provided, work with available data and clearly note limitations
- Specify which images support each diagnosis in your findings

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

Analysis ID: ${request.analysis_id}

Farmer ID: ${request.farmer_id || 'Not provided'}

Location: ${request.location || 'Not provided'}

GPS Coordinates: ${request.gps_coordinates ? JSON.stringify(request.gps_coordinates) : 'Not provided'}

Altitude: ${request.altitude || 'Not provided'} meters

Field ID: ${request.field_id || 'Not provided'}

Crop Type: ${request.crop_type || 'Not provided'}

Planting Date: ${request.planting_date || 'Not provided'}

Expected Harvest: ${request.expected_harvest_date || 'Not provided'}

Soil Type: ${request.soil_type || 'Not provided'}

Last Fertilization: ${request.last_fertilization || 'Not provided'}

Last Irrigation: ${request.last_irrigation || 'Not provided'}

Weather Conditions: ${request.weather_conditions || 'Not provided'}

Temperature: ${request.temperature || 'Not provided'}°C

Humidity: ${request.humidity || 'Not provided'}%

Previous Treatments: ${request.previous_treatments && request.previous_treatments.length > 0 ? JSON.stringify(request.previous_treatments) : 'None'}

Urgency Level: ${request.urgency_level || 'normal'}

Notes from Farmer: ${request.notes || 'None'}

============================================
IMAGES TO ANALYZE
============================================

Total Images Provided: ${imageCount}
Image Types: ${imagesProvided.join(', ')}

1. Leaf Top Image (Yaprak Üstü): ${request.leaf_top_url || 'Not provided'}
2. Leaf Bottom Image (Yaprak Altı): ${request.leaf_bottom_url || 'Not provided'}
3. Plant Overview Image (Genel Görünüm): ${request.plant_overview_url || 'Not provided'}
4. Root Image (Kök): ${request.root_url || 'Not provided'}

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
    "visible_parts": ["yapraklar", "gövde", "çiçekler", "meyveler", "kökler"],
    "identification_sources": ["hangi görüntülerden tespit edildi"]
  },
  "image_analysis": {
    "leaf_top": {
      "analyzed": true|false,
      "image_quality": "iyi|orta|düşük|görüntü yok",
      "findings": ["bulgu1", "bulgu2"],
      "symptoms_detected": ["belirti1", "belirti2"],
      "abnormalities": ["anormallik1", "anormallik2"],
      "confidence": 0-100,
      "notes": "Türkçe ek notlar"
    },
    "leaf_bottom": {
      "analyzed": true|false,
      "image_quality": "iyi|orta|düşük|görüntü yok",
      "findings": ["bulgu1", "bulgu2"],
      "symptoms_detected": ["belirti1", "belirti2"],
      "abnormalities": ["anormallik1", "anormallik2"],
      "pest_observations": ["yaprak altında gözlemlenen zararlılar"],
      "confidence": 0-100,
      "notes": "Türkçe ek notlar"
    },
    "plant_overview": {
      "analyzed": true|false,
      "image_quality": "iyi|orta|düşük|görüntü yok",
      "findings": ["bulgu1", "bulgu2"],
      "symptoms_detected": ["belirti1", "belirti2"],
      "growth_assessment": "normal|bodur|aşırı uzamış|deforme",
      "wilting_pattern": "yok|genel|tek taraflı|uç kısımlarda",
      "confidence": 0-100,
      "notes": "Türkçe ek notlar"
    },
    "root": {
      "analyzed": true|false,
      "image_quality": "iyi|orta|düşük|görüntü yok",
      "findings": ["bulgu1", "bulgu2"],
      "symptoms_detected": ["belirti1", "belirti2"],
      "root_health": "sağlıklı|hafif hasarlı|orta hasarlı|ciddi hasarlı|çürümüş",
      "root_color": "beyaz (sağlıklı)|krem|kahverengi|siyah",
      "galling_present": true|false,
      "confidence": 0-100,
      "notes": "Türkçe ek notlar"
    },
    "cross_image_correlation": {
      "confirmed_diagnoses": [
        {
          "diagnosis": "teşhis adı",
          "supporting_images": ["leaf_top", "plant_overview"],
          "confidence_boost": "çoklu görüntü desteği ile güven artışı açıklaması"
        }
      ],
      "conflicting_observations": ["çelişkili gözlemler varsa açıklama"],
      "diagnosis_requiring_more_images": ["hangi teşhisler için ek görüntü gerekli"],
      "recommended_additional_images": ["önerilen ek görüntü türleri ve nedenleri"]
    }
  },
  "health_assessment": {
    "vigor_score": 1-10,
    "leaf_color": "Türkçe açıklama",
    "leaf_texture": "Türkçe açıklama",
    "growth_pattern": "normal|anormal - detay",
    "structural_integrity": "sağlam|orta|zayıf - detay",
    "stress_indicators": ["belirti1", "belirti2"],
    "disease_symptoms": ["belirti1", "belirti2"],
    "severity": "yok|düşük|orta|yüksek|kritik",
    "assessment_based_on": ["değerlendirmede kullanılan görüntüler"]
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
    "severity": "yok|düşük|orta|yüksek|kritik",
    "visual_indicators_by_image": {
      "leaf_top_indicators": ["yaprak üstünde görülen besin eksikliği belirtileri"],
      "leaf_bottom_indicators": ["yaprak altında görülen belirtiler"],
      "root_indicators": ["kökte görülen besin sorunları"]
    }
  },
  "pest_disease": {
    "pests_detected": [
      {
        "type": "zararlı adı",
        "group": "böcek|akar|nematod|kemirgen|diğer",
        "severity": "düşük|orta|yüksek",
        "confidence": 0-100,
        "location": "bitkinin bölgesi",
        "detected_in_images": ["leaf_bottom", "plant_overview"],
        "life_stage_observed": "yumurta|larva|nimf|ergin|hepsi"
      }
    ],
    "diseases_detected": [
      {
        "type": "hastalık adı",
        "category": "fungal|bakteriyel|viral|fizyolojik",
        "severity": "düşük|orta|yüksek",
        "affected_parts": ["etkilenen kısımlar"],
        "confidence": 0-100,
        "detected_in_images": ["leaf_top", "root"],
        "progression_stage": "erken|orta|ileri"
      }
    ],
    "damage_pattern": "zarar deseni açıklaması",
    "affected_area_percentage": 0-100,
    "spread_risk": "yok|düşük|orta|yüksek",
    "primary_issue": "ana sorun veya yok",
    "root_specific_issues": {
      "root_rot_detected": true|false,
      "nematode_damage": true|false,
      "soil_borne_pathogens": ["tespit edilen toprak kaynaklı patojenler"]
    }
  },
  "environmental_stress": {
    "water_status": "optimal|hafif kurak|kurak|hafif fazla|su baskını",
    "temperature_stress": "yok|hafif sıcak|aşırı sıcak|hafif soğuk|aşırı soğuk",
    "light_stress": "yok|yetersiz|aşırı",
    "physical_damage": "yok|rüzgar|dolu|mekanik|hayvan",
    "chemical_damage": "yok|şüpheli|kesin - detay",
    "physiological_disorders": [
      {"type": "güneş yanığı|tuz zararı|don zararı|herbisit zararı|besin toksisitesi", "severity": "düşük|orta|yüksek", "notes": "detaylar", "visible_in_images": ["hangi görüntülerde görülüyor"]}
    ],
    "soil_health_indicators": {
      "salinity": "yok|hafif|orta|şiddetli",
      "pH_issue": "asidik|alkali|optimal",
      "organic_matter": "düşük|orta|yüksek",
      "compaction_signs": "kök görüntüsünden çıkarılan sıkışma belirtileri"
    },
    "primary_stressor": "ana stres faktörü veya yok"
  },
  "cross_factor_insights": [
    {
      "insight": "faktörler arası ilişki açıklaması",
      "confidence": 0.0-1.0,
      "affected_aspects": ["alan1", "alan2"],
      "impact_level": "düşük|orta|yüksek",
      "supporting_evidence_from_images": ["hangi görüntülerden kanıt"]
    }
  ],
  "risk_assessment": {
    "yield_loss_probability": "düşük|orta|yüksek",
    "timeline_to_worsen": "gün|hafta",
    "spread_potential": "yok|lokal|tarlanın geneli",
    "root_system_risk": "kök sisteminin genel risk değerlendirmesi"
  },
  "recommendations": {
    "immediate": [
      {"action": "ne yapılmalı", "details": "özel talimat", "timeline": "X saat içinde", "priority": "kritik|yüksek|orta", "based_on_finding": "hangi bulgulara göre"}
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
    "root_care": [
      {"action": "kök bakımı önerisi", "details": "detaylı talimat", "reason": "neden gerekli"}
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
    "estimated_yield_impact": "yok|minimal|orta|önemli|çok ciddi",
    "images_analyzed_count": 1-4,
    "analysis_completeness": "tam|kısmi - eksik görüntüler belirtilmeli"
  },
  "confidence_notes": [
    {"aspect": "nutrient_status", "confidence": 0.85, "reason": "Türkçe açıklama", "could_improve_with": "hangi ek görüntü güveni artırır"}
  ],
  "farmer_friendly_summary": "Çiftçi için sade Türkçe açıklama. Her görüntüden elde edilen ana bulgular özetlenmeli. Yaprak üstü, yaprak altı, genel görünüm ve kök analizlerinden çıkarılan sonuçlar basit dille anlatılmalı. Acil yapılması gerekenler ve dikkat edilmesi gereken noktalar vurgulanmalı."
}`;
  }

  /**
   * Image URL'lerini OpenAI API formatına çevirir
   */
  private buildImageContents(request: AnalysisRequest): OpenAI.Chat.Completions.ChatCompletionContentPartImage[] {
    const imageContents: OpenAI.Chat.Completions.ChatCompletionContentPartImage[] = [];

    // Leaf Top Image
    if (request.leaf_top_url) {
      imageContents.push({
        type: 'image_url',
        image_url: {
          url: request.leaf_top_url,
          detail: 'high' // Yüksek detay için
        }
      });
    }

    // Leaf Bottom Image
    if (request.leaf_bottom_url) {
      imageContents.push({
        type: 'image_url',
        image_url: {
          url: request.leaf_bottom_url,
          detail: 'high'
        }
      });
    }

    // Plant Overview Image
    if (request.plant_overview_url) {
      imageContents.push({
        type: 'image_url',
        image_url: {
          url: request.plant_overview_url,
          detail: 'high'
        }
      });
    }

    // Root Image
    if (request.root_url) {
      imageContents.push({
        type: 'image_url',
        image_url: {
          url: request.root_url,
          detail: 'high'
        }
      });
    }

    // Backward compatibility - eski image_url alanı
    if (!imageContents.length && request.image_url) {
      imageContents.push({
        type: 'image_url',
        image_url: {
          url: request.image_url,
          detail: 'high'
        }
      });
    }

    return imageContents;
  }
}

// =============================================================================
// USAGE EXAMPLE
// =============================================================================

/*
// Worker içinde kullanım örneği:

import { OpenAIAnalysisProvider, AnalysisRequest } from './openai-provider';

const provider = new OpenAIAnalysisProvider(process.env.OPENAI_API_KEY!);

async function processAnalysis(request: AnalysisRequest) {
  try {
    const response = await provider.analyze(request);
    
    console.log('Analysis completed:', {
      analysisId: request.analysis_id,
      healthScore: response.result.summary.overall_health_score,
      confidence: response.result.summary.confidence_level,
      tokenUsage: response.token_usage,
      processingTime: response.processing_time_ms
    });
    
    return response;
  } catch (error) {
    console.error('Analysis failed:', error);
    throw error;
  }
}
*/

export default OpenAIAnalysisProvider;
