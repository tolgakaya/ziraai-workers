/**
 * Configuration types for ZiraAI Dispatcher Service
 */

export type ProviderType = 'openai' | 'gemini' | 'anthropic';

export type StrategyType =
  | 'FIXED'
  | 'ROUND_ROBIN'
  | 'COST_OPTIMIZED'
  | 'QUALITY_FIRST'
  | 'WEIGHTED'
  | 'MESSAGE_BASED';

export interface WeightConfig {
  provider: ProviderType;
  weight: number; // Percentage (0-100)
}

export interface DispatcherConfig {
  dispatcher: {
    id: string;
    strategy: StrategyType;
    fixedProvider?: ProviderType;
    availableProviders?: ProviderType[];
    weights?: WeightConfig[];
  };
  rabbitmq: {
    url: string;
    queues: {
      rawAnalysis: string;
      openai: string;
      gemini: string;
      anthropic: string;
      dlq: string;
    };
    retrySettings: {
      maxRetryAttempts: number;
      retryDelayMs: number;
    };
  };
}

export interface AnalysisRequest {
  // Image URLs
  ImageUrl?: string;
  LeafTopUrl?: string;
  LeafBottomUrl?: string;
  PlantOverviewUrl?: string;
  RootUrl?: string;

  // User context
  UserId?: number;
  FarmerId?: number;
  SponsorId?: number;
  SponsorUserId?: number;
  SponsorshipCodeId?: number;

  // Metadata
  Location?: string;
  GpsCoordinates?: {
    Lat: number;
    Lng: number;
  };
  CropType?: string;
  FieldId?: number;
  UrgencyLevel?: string;
  Notes?: string;

  // Additional fields
  Altitude?: number;
  PlantingDate?: string;
  ExpectedHarvestDate?: string;
  LastFertilization?: string;
  LastIrrigation?: string;
  PreviousTreatments?: string[];
  WeatherConditions?: string;
  Temperature?: number;
  Humidity?: number;
  SoilType?: string;
  ContactInfo?: {
    Phone?: string;
    Email?: string;
  };
  AdditionalInfo?: any;

  // Queue management
  ResponseQueue?: string;
  CorrelationId?: string;
  AnalysisId?: string;

  // Provider selection (for MESSAGE_BASED strategy)
  provider?: string; // Legacy n8n compatibility
}
