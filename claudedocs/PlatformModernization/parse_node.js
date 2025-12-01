// ============================================
// PARSE AND VALIDATE AI AGENT OUTPUT - MULTI-IMAGE VERSION
// Output structure remains EXACTLY the same as original
// ============================================

const item = $input.first();

// Helper function to parse GPS coordinates
function parseGpsCoordinates(gpsInput) {
  if (!gpsInput) return null;
  
  // Already in object format
  if (typeof gpsInput === 'object' && gpsInput !== null) {
    return {
      lat: parseFloat(gpsInput.lat || gpsInput.Lat || 0),
      lng: parseFloat(gpsInput.lng || gpsInput.Lng || gpsInput.lon || gpsInput.Lon || 0)
    };
  }
  
  // String format: "39.9334,32.8597"
  if (typeof gpsInput === 'string' && gpsInput.includes(',')) {
    const parts = gpsInput.split(',').map(p => p.trim());
    if (parts.length >= 2) {
      const lat = parseFloat(parts[0]);
      const lng = parseFloat(parts[1]);
      if (!isNaN(lat) && !isNaN(lng)) {
        return {
          lat: lat,
          lng: lng
        };
      }
    }
  }
  
  // Unable to parse, return null
  return null;
}

// FIRST PRESERVE ALL INPUT FIELDS (UNCHANGED)
const preservedFields = {
  analysis_id: item.json.analysis_id,
  timestamp: item.json.timestamp,
  farmer_id: item.json.farmer_id,
  sponsor_id: item.json.sponsor_id,
  location: item.json.location,
  gps_coordinates: parseGpsCoordinates(item.json.gps_coordinates),  // Convert to object format
  altitude: item.json.altitude,
  field_id: item.json.field_id,
  crop_type: item.json.crop_type,
  planting_date: item.json.planting_date,
  expected_harvest_date: item.json.expected_harvest_date,
  last_fertilization: item.json.last_fertilization,
  last_irrigation: item.json.last_irrigation,
  previous_treatments: item.json.previous_treatments,
  weather_conditions: item.json.weather_conditions,
  temperature: item.json.temperature,
  humidity: item.json.humidity,
  soil_type: item.json.soil_type,
  urgency_level: item.json.urgency_level,
  notes: item.json.notes,
  contact_info: item.json.contact_info,
  additional_info: item.json.additional_info,
  image_url: item.json.image_url,
  image_metadata: item.json.image_metadata,
  request_metadata: item.json.request_metadata,
  rabbitmq_metadata: item.json.rabbitmq_metadata,
  token_usage: item.json.token_usage
};

console.log('=== PARSE NODE - PRESERVED FIELDS ==================');
console.log(`Farmer ID: ${preservedFields.farmer_id}`);
console.log(`Sponsor ID: ${preservedFields.sponsor_id}`);
console.log(`GPS Coordinates: ${JSON.stringify(preservedFields.gps_coordinates)}`);
console.log(`Total Images: ${preservedFields.image_metadata?.total_images || 1}`);

const agentOutput = item.json.output || item.json.response || item.json.content || item.json.text || item.json.message || "";

console.log("Raw output length:", agentOutput.length);
console.log("Output type:", typeof agentOutput);

let analysis;
let parseSuccess = false;

try {
  // Try to parse JSON from agent output
  if (typeof agentOutput === 'string') {
    let cleanedOutput = agentOutput;
    cleanedOutput = cleanedOutput.replace(/```json\n?/g, '');
    cleanedOutput = cleanedOutput.replace(/```\n?/g, '');
    
    const jsonStart = cleanedOutput.indexOf('{');
    const jsonEnd = cleanedOutput.lastIndexOf('}') + 1;
    
    if (jsonStart !== -1 && jsonEnd !== 0) {
      const jsonStr = cleanedOutput.substring(jsonStart, jsonEnd);
      console.log("Extracted JSON length:", jsonStr.length);
      analysis = JSON.parse(jsonStr);
      parseSuccess = true;
      console.log("✓ JSON parsed successfully");
    } else {
      throw new Error('No JSON structure found in response');
    }
  } else if (typeof agentOutput === 'object' && agentOutput !== null) {
    analysis = agentOutput;
    parseSuccess = true;
    console.log("✓ Response already in object format");
  } else {
    throw new Error('Invalid response format from AI agent');
  }
  
  // MERGE WITH PRESERVED FIELDS - THIS IS CRITICAL
  analysis = {
    ...analysis,           // AI analysis results
    ...preservedFields     // Override with all preserved fields
  };
  
  // Validate required sections exist (UNCHANGED structure)
  const requiredSections = [
    'plant_identification',
    'health_assessment',
    'nutrient_status',
    'pest_disease',
    'environmental_stress',
    'recommendations',
    'summary'
  ];
  
  for (const section of requiredSections) {
    if (!analysis[section]) {
      console.warn(`⚠ Missing section: ${section}, adding default`);
      // Add default structures (UNCHANGED from original)
      switch(section) {
        case 'plant_identification':
          analysis[section] = {
            species: "Unable to identify",
            variety: "unknown",
            growth_stage: "unknown",
            confidence: 0,
            identifying_features: [],
            visible_parts: []
          };
          break;
        case 'health_assessment':
          analysis[section] = {
            vigor_score: 5,
            leaf_color: "Not analyzed",
            leaf_texture: "Not analyzed",
            growth_pattern: "Not analyzed",
            structural_integrity: "Not analyzed",
            stress_indicators: [],
            disease_symptoms: [],
            severity: "unknown"
          };
          break;
        case 'nutrient_status':
          analysis[section] = {
            nitrogen: "unknown",
            phosphorus: "unknown",
            potassium: "unknown",
            calcium: "unknown",
            magnesium: "unknown",
            iron: "unknown",
            primary_deficiency: "none",
            secondary_deficiencies: [],
            severity: "unknown"
          };
          break;
        case 'pest_disease':
          analysis[section] = {
            pests_detected: [],
            diseases_detected: [],
            damage_pattern: "Not analyzed",
            affected_area_percentage: 0,
            spread_risk: "unknown",
            primary_issue: "none"
          };
          break;
        case 'environmental_stress':
          analysis[section] = {
            water_status: "unknown",
            temperature_stress: "unknown",
            light_stress: "unknown",
            physical_damage: "unknown",
            chemical_damage: "unknown",
            soil_indicators: "Not analyzed",
            primary_stressor: "none"
          };
          break;
        case 'recommendations':
          analysis[section] = {
            immediate: [],
            short_term: [],
            preventive: [],
            monitoring: []
          };
          break;
        case 'summary':
          analysis[section] = {
            overall_health_score: 5,
            primary_concern: "Analysis incomplete",
            secondary_concerns: [],
            critical_issues_count: 0,
            confidence_level: 0,
            prognosis: "unknown",
            estimated_yield_impact: "unknown"
          };
          break;
      }
    }
  }
  
  // Ensure arrays exist
  analysis.cross_factor_insights = analysis.cross_factor_insights || [];
  
  // Add processing metadata (UNCHANGED structure)
  analysis.processing_metadata = {
    parse_success: parseSuccess,
    processing_timestamp: new Date().toISOString(),
    ai_model: 'gpt-4o-mini',
    workflow_version: '2.0-url-based',
    image_source: 'url'
  };
  
  console.log("✓ Analysis validation complete");
  console.log(`Health Score: ${analysis.summary.overall_health_score}/10`);
  console.log(`Primary Concern: ${analysis.summary.primary_concern}`);
  
} catch (error) {
  console.error('❌ Parse/Validation error:', error.message);
  
  // Return structured error response with ALL preserved fields (UNCHANGED structure)
  analysis = {
    error: true,
    error_message: error.message,
    error_type: 'parsing_error',
    raw_output_sample: agentOutput.substring(0, 500),
    
    // PRESERVE ALL INPUT FIELDS
    ...preservedFields,
    
    // Default error structures (UNCHANGED from original)
    plant_identification: {
      species: "Error - Unable to analyze",
      variety: "unknown",
      growth_stage: "unknown",
      confidence: 0,
      identifying_features: [],
      visible_parts: []
    },
    health_assessment: {
      vigor_score: 0,
      leaf_color: "Unable to analyze due to error",
      leaf_texture: "Unable to analyze due to error",
      growth_pattern: "Unable to analyze due to error",
      structural_integrity: "Unable to analyze due to error",
      stress_indicators: [],
      disease_symptoms: [],
      severity: "unknown"
    },
    nutrient_status: {
      nitrogen: "unknown",
      phosphorus: "unknown",
      potassium: "unknown",
      calcium: "unknown",
      magnesium: "unknown",
      iron: "unknown",
      primary_deficiency: "Unable to determine",
      secondary_deficiencies: [],
      severity: "unknown"
    },
    pest_disease: {
      pests_detected: [],
      diseases_detected: [],
      damage_pattern: "Unable to analyze due to error",
      affected_area_percentage: 0,
      spread_risk: "unknown",
      primary_issue: "Unable to determine"
    },
    environmental_stress: {
      water_status: "unknown",
      temperature_stress: "unknown",
      light_stress: "unknown",
      physical_damage: "unknown",
      chemical_damage: "unknown",
      soil_indicators: "Unable to analyze due to error",
      primary_stressor: "Unable to determine"
    },
    cross_factor_insights: [],
    recommendations: {
      immediate: [
        {
          action: "Manual inspection required",
          details: "Automated analysis encountered an error. Please have an agricultural expert manually inspect the plant.",
          timeline: "As soon as possible",
          priority: "critical"
        }
      ],
      short_term: [],
      preventive: [],
      monitoring: []
    },
    summary: {
      overall_health_score: 0,
      primary_concern: "Analysis failed - manual review required",
      secondary_concerns: ["System error occurred"],
      critical_issues_count: 0,
      confidence_level: 0,
      prognosis: "unknown",
      estimated_yield_impact: "unknown"
    },
    processing_metadata: {
      parse_success: false,
      processing_timestamp: new Date().toISOString(),
      ai_model: 'gpt-4o-mini',
      workflow_version: '2.0-url-based',
      image_source: 'url',
      error_details: error.toString()
    }
  };
}

console.log('=== FINAL PARSE OUTPUT CHECK =======================');
console.log(`Farmer ID in final output: ${analysis.farmer_id}`);
console.log(`Sponsor ID in final output: ${analysis.sponsor_id}`);
console.log(`GPS Coordinates in final output: ${JSON.stringify(analysis.gps_coordinates)}`);
console.log('================================================');

return { 
  json: analysis
};