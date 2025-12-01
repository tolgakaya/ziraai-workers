/**
 * Message types for RabbitMQ communication
 * CRITICAL: These types MUST match C# DTOs exactly for WebAPI/PlantAnalysisWorkerService compatibility
 */

// ============================================
// WEBAPI REQUEST MESSAGE (C# → TypeScript)
// ============================================

/**
 * GPS Coordinates structure (matches C# GpsCoordinates)
 */
export interface GpsCoordinates {
  Lat: number;
  Lng: number;
}

/**
 * Contact information structure (matches C# ContactInfo)
 */
export interface ContactInfo {
  Phone?: string;
  Email?: string;
}

/**
 * Additional information data (matches C# AdditionalInfoData)
 */
export interface AdditionalInfoData {
  [key: string]: any; // Flexible structure for additional data
}

/**
 * Plant Analysis Request from WebAPI
 * Source: Entities/Dtos/PlantAnalysisAsyncRequestDto.cs
 *
 * CRITICAL: WebAPI sends PascalCase fields (NOT snake_case)
 * This interface MUST match C# DTO exactly for proper deserialization
 */
export interface PlantAnalysisAsyncRequestDto {
  // Image (URL-based, NOT base64 anymore)
  Image: string | null;              // NULL - WebAPI V2 doesn't send base64
  ImageUrl: string;                  // PRIMARY: Full image URL from storage service

  // User & Attribution
  UserId?: number | null;
  FarmerId: string;                  // Format: "F{userId}" (e.g., "F046")
  SponsorId?: string | null;
  SponsorUserId?: number | null;     // Actual sponsor user ID
  SponsorshipCodeId?: number | null; // SponsorshipCode table ID

  // Analysis Request
  Location?: string | null;
  GpsCoordinates?: GpsCoordinates | null;
  CropType: string;
  FieldId?: string | null;
  UrgencyLevel?: string | null;
  Notes?: string | null;

  // RabbitMQ Metadata (top-level fields, NOT nested)
  ResponseQueue: string;             // "plant-analysis-results"
  CorrelationId: string;
  AnalysisId: string;

  // Additional Context
  Altitude?: number | null;
  PlantingDate?: string | null;      // ISO 8601 date string from C# DateTime
  ExpectedHarvestDate?: string | null;
  LastFertilization?: string | null;
  LastIrrigation?: string | null;
  PreviousTreatments?: string[] | null;
  WeatherConditions?: string | null;
  Temperature?: number | null;       // C# decimal serialized as number
  Humidity?: number | null;
  SoilType?: string | null;
  ContactInfo?: ContactInfo | null;
  AdditionalInfo?: AdditionalInfoData | null;
}

// ============================================
// WORKER RESPONSE MESSAGE (TypeScript → C#)
// ============================================

/**
 * Plant Identification Analysis Results
 * CRITICAL: Uses snake_case (has [JsonProperty] attributes in C#)
 */
export interface PlantIdentification {
  species: string;
  variety: string;
  growth_stage: string;
  confidence: number;
  identifying_features: string[];
  visible_parts: string[];
}

/**
 * Health Assessment Results
 * CRITICAL: Uses snake_case (has [JsonProperty] attributes in C#)
 */
export interface HealthAssessment {
  vigor_score: number;
  leaf_color: string;
  leaf_texture: string;
  growth_pattern: string;
  structural_integrity: string;
  stress_indicators: string[];
  disease_symptoms: string[];
  severity: string;
}

/**
 * Nutrient Status Analysis (All 14 elements)
 * CRITICAL: Uses snake_case (has [JsonProperty] attributes in C#)
 */
export interface NutrientStatus {
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
}

/**
 * Detected Pest Information
 */
export interface PestDetectedDto {
  type: string;
  category: string;
  severity: string;
  affected_parts: string[];
  confidence: number;
}

/**
 * Detected Disease Information
 */
export interface DiseaseDetectedDto {
  type: string;
  category: string;
  severity: string;
  affected_parts: string[];
  confidence: number;
}

/**
 * Pest and Disease Analysis
 * CRITICAL: Uses snake_case (has [JsonProperty] attributes in C#)
 */
export interface PestDisease {
  pests_detected: PestDetectedDto[];
  diseases_detected: DiseaseDetectedDto[];
  damage_pattern: string;
  affected_area_percentage: number;
  spread_risk: string;
  primary_issue: string;
}

/**
 * Environmental Stress Analysis
 * CRITICAL: Uses snake_case (has [JsonProperty] attributes in C#)
 */
export interface EnvironmentalStress {
  water_status: string;
  temperature_stress: string;
  light_stress: string;
  physical_damage: string;
  chemical_damage: string;
  soil_indicators: string;
  primary_stressor: string;
}

/**
 * Cross-Factor Insight
 */
export interface CrossFactorInsight {
  insight: string;
  confidence: number;
  affected_aspects: string[];
  impact_level: string;
}

/**
 * Individual Recommendation
 */
export interface Recommendation {
  action: string;
  details: string;
  timeline: string;
  priority: string;
}

/**
 * Monitoring Parameter
 */
export interface MonitoringParameter {
  parameter: string;
  frequency: string;
  threshold: string;
}

/**
 * Resource Estimation
 */
export interface ResourceEstimation {
  water_required_liters: string;
  fertilizer_cost_estimate_usd: string;
  labor_hours_estimate: string;
}

/**
 * Localized Recommendations
 */
export interface LocalizedRecommendations {
  region: string;
  preferred_practices: string[];
  restricted_methods: string[];
}

/**
 * Complete Recommendations Structure
 * CRITICAL: Uses snake_case (has [JsonProperty] attributes in C#)
 */
export interface Recommendations {
  immediate: Recommendation[];
  short_term: Recommendation[];
  preventive: Recommendation[];
  monitoring: MonitoringParameter[];
  resource_estimation?: ResourceEstimation;
  localized_recommendations?: LocalizedRecommendations;
}

/**
 * Analysis Summary
 * CRITICAL: Uses snake_case (has [JsonProperty] attributes in C#)
 */
export interface AnalysisSummary {
  overall_health_score: number;
  primary_concern: string;
  secondary_concerns: string[];
  critical_issues_count: number;
  confidence_level: number;
  prognosis: string;
  estimated_yield_impact: string;
}

/**
 * Risk Assessment
 * CRITICAL: Uses snake_case (has [JsonProperty] attributes in C#)
 */
export interface RiskAssessment {
  yield_loss_probability: string;
  timeline_to_worsen: string;
  spread_potential: string;
}

/**
 * Confidence Note
 */
export interface ConfidenceNote {
  aspect: string;
  confidence: number;
  reason: string;
}

/**
 * Image Metadata
 * CRITICAL: Uses PascalCase (NO [JsonProperty] attributes in C#)
 * These fields MUST be PascalCase in JSON for C# deserialization
 */
export interface ImageMetadata {
  Format?: string;
  URL?: string;                      // CRITICAL: PascalCase! Used by PlantAnalysisJobService line 231
  SizeBytes?: number;
  SizeKb?: number;
  SizeMb?: number;
  Base64Length?: number;
  UploadTimestamp?: string;          // ISO 8601
}

/**
 * Processing Metadata
 * CRITICAL: Uses PascalCase (NO [JsonProperty] attributes in C#)
 * These fields MUST be PascalCase in JSON for C# deserialization
 */
export interface ProcessingMetadata {
  ParseSuccess: boolean;
  ProcessingTimestamp: string;       // ISO 8601
  AiModel: string;                   // e.g., "gpt-4o-mini", "gemini-2.0-flash-exp"
  WorkflowVersion: string;           // e.g., "2.0.0"
  ReceivedAt: string;                // ISO 8601
  ProcessingTimeMs: number;
  RetryCount: number;
  Priority?: string;
}

/**
 * Token Usage Information
 * CRITICAL: Uses snake_case (has [JsonProperty] attributes in C#)
 * SIMPLIFIED structure compared to N8N (flat, not nested)
 */
export interface TokenUsage {
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  cost_usd: number;
  cost_try: number;
}

/**
 * Request Metadata
 * CRITICAL: Uses snake_case (has [JsonProperty] attributes in C#)
 */
export interface RequestMetadata {
  user_agent?: string;
  ip_address?: string;
  request_timestamp?: string;        // ISO 8601
  request_id?: string;
  api_version?: string;
}

/**
 * Plant Analysis Response to PlantAnalysisWorkerService
 * Source: Entities/Dtos/PlantAnalysisAsyncResponseDto.cs
 *
 * CRITICAL CASING RULES:
 * 1. Analysis results (plant_identification, health_assessment, etc.) → snake_case
 * 2. Metadata fields echoed from request → snake_case (with [JsonProperty])
 * 3. SponsorUserId, SponsorshipCodeId → PascalCase (NO [JsonProperty])
 * 4. ProcessingMetadata fields → PascalCase (NO [JsonProperty])
 * 5. ImageMetadata fields → PascalCase (NO [JsonProperty])
 */
export interface PlantAnalysisAsyncResponseDto {
  // ============================================
  // ANALYSIS RESULTS (snake_case)
  // ============================================
  plant_identification: PlantIdentification;
  health_assessment: HealthAssessment;
  nutrient_status: NutrientStatus;
  pest_disease: PestDisease;
  environmental_stress: EnvironmentalStress;
  cross_factor_insights: CrossFactorInsight[];
  recommendations: Recommendations;
  summary: AnalysisSummary;

  // ============================================
  // METADATA (snake_case, echoed from request)
  // ============================================
  analysis_id: string;               // From request.AnalysisId
  timestamp: string;                 // ISO 8601 datetime when analysis completed
  user_id?: number | null;           // From request.UserId
  farmer_id: string;                 // From request.FarmerId
  sponsor_id?: string | null;        // From request.SponsorId

  // CRITICAL: These two fields are PascalCase (NO underscore!)
  SponsorUserId?: number | null;     // PascalCase! C# has no [JsonProperty] attribute
  SponsorshipCodeId?: number | null; // PascalCase! C# has no [JsonProperty] attribute

  location?: string | null;
  gps_coordinates?: GpsCoordinates | null;
  altitude?: number | null;
  field_id?: string | null;
  crop_type: string;
  planting_date?: string | null;
  expected_harvest_date?: string | null;
  last_fertilization?: string | null;
  last_irrigation?: string | null;
  previous_treatments?: string[] | null;
  weather_conditions?: string | null;
  temperature?: number | null;
  humidity?: number | null;
  soil_type?: string | null;
  urgency_level?: string | null;
  notes?: string | null;
  contact_info?: ContactInfo | null;
  additional_info?: AdditionalInfoData | null;

  // ============================================
  // IMAGE URLs (snake_case)
  // ============================================
  image_url?: string | null;
  image_path?: string | null;
  leaf_top_url?: string | null;
  leaf_bottom_url?: string | null;
  plant_overview_url?: string | null;
  root_url?: string | null;

  // ============================================
  // PROCESSING METADATA (PascalCase!)
  // ============================================
  image_metadata?: ImageMetadata;    // All fields inside are PascalCase
  processing_metadata: ProcessingMetadata; // All fields inside are PascalCase
  token_usage?: TokenUsage;          // Fields inside are snake_case
  request_metadata?: RequestMetadata; // Fields inside are snake_case

  // ============================================
  // ADDITIONAL FIELDS (snake_case)
  // ============================================
  risk_assessment?: RiskAssessment;
  confidence_notes?: ConfidenceNote[];
  farmer_friendly_summary?: string;

  // ============================================
  // RESPONSE STATUS (snake_case)
  // ============================================
  success: boolean;                  // REQUIRED: true for successful analysis
  message?: string;
  error: boolean;                    // REQUIRED: false for successful analysis
  error_message?: string | null;
  error_type?: string | null;
}

// ============================================
// LEGACY N8N TYPES (DEPRECATED - Keep for reference only)
// ============================================

/**
 * @deprecated Legacy N8N message format - DO NOT USE
 * Kept for reference only. Use PlantAnalysisAsyncRequestDto instead.
 */
export interface RawAnalysisMessage {
  analysis_id: string;
  timestamp: string;
  image: string;
  leaf_top_image?: string;
  leaf_bottom_image?: string;
  plant_overview_image?: string;
  root_image?: string;
  user_id?: string | number;
  farmer_id?: string | number;
  sponsor_id?: string | number;
  location?: string;
  gps_coordinates?: string | { lat: number; lng: number };
  altitude?: number;
  field_id?: string | number;
  crop_type?: string;
  planting_date?: string;
  expected_harvest_date?: string;
  last_fertilization?: string;
  last_irrigation?: string;
  previous_treatments?: string[];
  weather_conditions?: string;
  temperature?: number;
  humidity?: number;
  soil_type?: string;
  urgency_level?: 'low' | 'normal' | 'high' | 'critical';
  notes?: string;
  contact_info?: {
    phone?: string;
    email?: string;
  };
  additional_info?: {
    irrigation_method?: string;
    greenhouse?: boolean;
    organic_certified?: boolean;
  };
  image_metadata?: any;
  rabbitmq_metadata?: any;
}

/**
 * @deprecated Legacy N8N result format - DO NOT USE
 * Kept for reference only. Use PlantAnalysisAsyncResponseDto instead.
 */
export interface AnalysisResultMessage {
  analysis_id: string;
  timestamp: string;
  farmer_id?: string | number;
  sponsor_id?: string | number;
  user_id?: string | number;
  location?: string;
  gps_coordinates?: { lat: number; lng: number };
  altitude?: number;
  field_id?: string | number;
  crop_type?: string;
  planting_date?: string;
  expected_harvest_date?: string;
  last_fertilization?: string;
  last_irrigation?: string;
  previous_treatments?: string[];
  weather_conditions?: string;
  temperature?: number;
  humidity?: number;
  soil_type?: string;
  urgency_level?: string;
  notes?: string;
  contact_info?: any;
  additional_info?: any;
  image_url?: string;
  image_metadata?: any;
  request_metadata?: any;
  rabbitmq_metadata?: any;
  plant_identification: any;
  health_assessment: any;
  nutrient_status: any;
  pest_disease: any;
  environmental_stress: any;
  cross_factor_insights?: any[];
  risk_assessment?: any;
  recommendations: any;
  summary: any;
  confidence_notes?: any[];
  farmer_friendly_summary?: string;
  processing_metadata: any;
  token_usage?: any;
  error?: boolean;
  error_message?: string;
  error_type?: string;
  raw_output_sample?: string;
}

// ============================================
// INTERNAL WORKER TYPES
// ============================================

/**
 * Provider-specific analysis message (for future provider-specific queues)
 */
export interface ProviderAnalysisMessage extends PlantAnalysisAsyncRequestDto {
  provider: 'openai' | 'gemini' | 'anthropic';
  attemptNumber: number;
}

/**
 * Dead letter queue message
 */
export interface DeadLetterMessage {
  originalMessage: PlantAnalysisAsyncRequestDto;
  error: string;
  failureTimestamp: string;
  attemptCount: number;
  lastProvider: string;
}
