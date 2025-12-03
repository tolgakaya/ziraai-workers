Dispatcher Environment Variables - Complete Strategy Guide
🔧 Common Variables (Tüm Stratejiler İçin Gerekli)
# Dispatcher Identification
DISPATCHER_ID=dispatcher-prod

# RabbitMQ Connection
RABBITMQ_URL=amqp://user:pass@rabbitmq.railway.internal:5672

# Queue Names
RAW_ANALYSIS_QUEUE=raw-analysis-queue
OPENAI_QUEUE=openai-analysis-queue
GEMINI_QUEUE=gemini-analysis-queue
ANTHROPIC_QUEUE=anthropic-analysis-queue
DLQ_QUEUE=analysis-dlq

# Retry Settings
MAX_RETRY_ATTEMPTS=3
RETRY_DELAY_MS=1000
1️⃣ FIXED Strategy (Tek Provider'a Yönlendir)
Use Case: Tek bir provider'ı test etmek veya belirli bir provider'ı zorlamak
PROVIDER_SELECTION_STRATEGY=FIXED
PROVIDER_FIXED=gemini  # Seçenekler: openai | gemini | anthropic

# AVAILABLE_PROVIDERS (opsiyonel, FIXED'de kullanılmaz)
Davranış: Tüm mesajları sadece PROVIDER_FIXED ile belirtilen queue'ya gönderir.
2️⃣ ROUND_ROBIN Strategy (Eşit Dağıtım)
Use Case: Tüm provider'lara eşit yük dağıtımı
PROVIDER_SELECTION_STRATEGY=ROUND_ROBIN

# AVAILABLE_PROVIDERS (opsiyonel, varsayılan: openai,gemini,anthropic)
AVAILABLE_PROVIDERS=openai,gemini,anthropic
Davranış:
mesaj → openai-queue
mesaj → gemini-queue
mesaj → anthropic-queue
mesaj → openai-queue (başa döner)
AVAILABLE_PROVIDERS ile Özelleştirme:
# Sadece 2 provider kullan
AVAILABLE_PROVIDERS=openai,gemini
# Sonuç: openai → gemini → openai → gemini...

# Sadece Gemini ve Anthropic
AVAILABLE_PROVIDERS=gemini,anthropic
# Sonuç: gemini → anthropic → gemini → anthropic...
3️⃣ COST_OPTIMIZED Strategy (Maliyet Odaklı)
Use Case: En ucuz provider'ı önceliklendir
PROVIDER_SELECTION_STRATEGY=COST_OPTIMIZED

# AVAILABLE_PROVIDERS (opsiyonel, hangi provider'lar kullanılabilir)
AVAILABLE_PROVIDERS=openai,gemini,anthropic
Davranış:
Maliyet sıralaması: Gemini ($1.087/1M) > OpenAI ($5.125/1M) > Anthropic ($48/1M)
Her zaman en ucuz available provider'ı seçer
AVAILABLE_PROVIDERS ile Özelleştirme:
# Gemini yoksa OpenAI kullan
AVAILABLE_PROVIDERS=openai,gemini
# Sonuç: Gemini yoksa OpenAI'ya gider

# Sadece premium providers
AVAILABLE_PROVIDERS=openai,anthropic
# Sonuç: OpenAI (Gemini yok, OpenAI en ucuz)
4️⃣ QUALITY_FIRST Strategy (Kalite Odaklı)
Use Case: En yüksek kaliteli provider'ı önceliklendir
PROVIDER_SELECTION_STRATEGY=QUALITY_FIRST

# AVAILABLE_PROVIDERS (opsiyonel, hangi provider'lar kullanılabilir)
AVAILABLE_PROVIDERS=openai,gemini,anthropic
Davranış:
Kalite sıralaması: Anthropic (10/10) > OpenAI (8/10) > Gemini (7/10)
Her zaman en yüksek kaliteli available provider'ı seçer
AVAILABLE_PROVIDERS ile Özelleştirme:
# Anthropic yoksa OpenAI kullan
AVAILABLE_PROVIDERS=openai,gemini
# Sonuç: OpenAI (Anthropic yok, OpenAI en kaliteli)

# Sadece Gemini ve Anthropic
AVAILABLE_PROVIDERS=gemini,anthropic
# Sonuç: Anthropic (en yüksek kalite)
5️⃣ WEIGHTED Strategy (Özel Ağırlıklı Dağıtım)
Use Case: Özel yüzdeliklerle yük dağıtımı (örn: %70 Gemini, %20 OpenAI, %10 Anthropic)
PROVIDER_SELECTION_STRATEGY=WEIGHTED

# Ağırlık konfigürasyonu (JSON formatı)
PROVIDER_WEIGHTS=[{"provider":"gemini","weight":70},{"provider":"openai","weight":20},{"provider":"anthropic","weight":10}]
Örnek Senaryolar: Maliyet Odaklı + Fallback:
PROVIDER_WEIGHTS=[{"provider":"gemini","weight":80},{"provider":"openai","weight":15},{"provider":"anthropic","weight":5}]
# Sonuç: %80 Gemini, %15 OpenAI, %5 Anthropic
Dengeli Kalite/Maliyet:
PROVIDER_WEIGHTS=[{"provider":"gemini","weight":50},{"provider":"openai","weight":40},{"provider":"anthropic","weight":10}]
# Sonuç: %50 Gemini, %40 OpenAI, %10 Anthropic
Sadece 2 Provider:
PROVIDER_WEIGHTS=[{"provider":"openai","weight":60},{"provider":"gemini","weight":40}]
# Sonuç: %60 OpenAI, %40 Gemini
Test/Production Split:
PROVIDER_WEIGHTS=[{"provider":"gemini","weight":90},{"provider":"anthropic","weight":10}]
# Sonuç: %90 test (Gemini), %10 kalite kontrol (Anthropic)
6️⃣ MESSAGE_BASED Strategy (Legacy N8N Uyumluluğu)
Use Case: Request içindeki provider alanından provider seçimi
PROVIDER_SELECTION_STRATEGY=MESSAGE_BASED

# AVAILABLE_PROVIDERS gerekli değil (message'dan okunur)
Davranış:
Request'teki provider alanını okur
Eğer provider alanı yoksa veya geçersizse → openai'ya fallback
Request Örneği:
{
  "AnalysisId": "test_123",
  "ImageUrl": "https://...",
  "provider": "gemini"  // Bu alan kullanılır
}
📊 Karşılaştırma Tablosu
Strateji	Required Variables	Optional Variables	Use Case
FIXED	PROVIDER_FIXED	-	Tek provider test
ROUND_ROBIN	-	AVAILABLE_PROVIDERS	Eşit yük dağıtımı
COST_OPTIMIZED	-	AVAILABLE_PROVIDERS	Maliyet minimizasyonu
QUALITY_FIRST	-	AVAILABLE_PROVIDERS	Kalite maksimizasyonu
WEIGHTED	PROVIDER_WEIGHTS	-	Özel yüzdelik dağıtım
MESSAGE_BASED	-	-	Legacy N8N uyumluluk
🎯 Önerilen Production Konfigürasyonları
Senaryo 1: Maliyet Odaklı Production
PROVIDER_SELECTION_STRATEGY=WEIGHTED
PROVIDER_WEIGHTS=[{"provider":"gemini","weight":75},{"provider":"openai","weight":20},{"provider":"anthropic","weight":5}]
Sonuç: Yüksek hacim Gemini'de, kalite kontrolü için OpenAI ve Anthropic
Senaryo 2: Dengeli Production
PROVIDER_SELECTION_STRATEGY=ROUND_ROBIN
AVAILABLE_PROVIDERS=openai,gemini,anthropic
Sonuç: Her provider eşit yük alır, sorun çıkarsa diğerleri devam eder
Senaryo 3: Saf Maliyet Optimizasyonu
PROVIDER_SELECTION_STRATEGY=COST_OPTIMIZED
AVAILABLE_PROVIDERS=gemini,openai
Sonuç: Her zaman Gemini (en ucuz), Gemini sorunluysa OpenAI'ya düşer
Senaryo 4: Premium Müşteriler
PROVIDER_SELECTION_STRATEGY=QUALITY_FIRST
AVAILABLE_PROVIDERS=anthropic,openai,gemini
Sonuç: Her zaman Anthropic (en kaliteli), sorun çıkarsa OpenAI, sonra Gemini
🧪 Test Senaryoları
Test 1: ROUND_ROBIN (2 Provider)
PROVIDER_SELECTION_STRATEGY=ROUND_ROBIN
AVAILABLE_PROVIDERS=openai,gemini
Beklenen: Message 1→openai, Message 2→gemini, Message 3→openai...
Test 2: WEIGHTED (70-30 Split)
PROVIDER_SELECTION_STRATEGY=WEIGHTED
PROVIDER_WEIGHTS=[{"provider":"gemini","weight":70},{"provider":"openai","weight":30}]
Beklenen: 100 message'dan ~70'i gemini, ~30'u openai
Test 3: COST_OPTIMIZED (Fallback Test)
PROVIDER_SELECTION_STRATEGY=COST_OPTIMIZED
AVAILABLE_PROVIDERS=openai,anthropic  # Gemini yok
Beklenen: Hepsi OpenAI'ya gider (Gemini yok, OpenAI en ucuz available)


✅ Tam Test Seti
Her stratejiyi test etmek için aşağıdaki sequence'i kullanabilirsiniz:
# 1. FIXED - Gemini Only
PROVIDER_SELECTION_STRATEGY=FIXED
PROVIDER_FIXED=gemini

# 2. FIXED - OpenAI Only  
PROVIDER_SELECTION_STRATEGY=FIXED
PROVIDER_FIXED=openai

# 3. ROUND_ROBIN - All Providers
PROVIDER_SELECTION_STRATEGY=ROUND_ROBIN
AVAILABLE_PROVIDERS=openai,gemini,anthropic

# 4. ROUND_ROBIN - 2 Providers
PROVIDER_SELECTION_STRATEGY=ROUND_ROBIN
AVAILABLE_PROVIDERS=openai,gemini

# 5. COST_OPTIMIZED - All Providers
PROVIDER_SELECTION_STRATEGY=COST_OPTIMIZED
AVAILABLE_PROVIDERS=openai,gemini,anthropic

# 6. QUALITY_FIRST - All Providers
PROVIDER_SELECTION_STRATEGY=QUALITY_FIRST
AVAILABLE_PROVIDERS=openai,gemini,anthropic

# 7. WEIGHTED - 70-20-10
PROVIDER_SELECTION_STRATEGY=WEIGHTED
PROVIDER_WEIGHTS=[{"provider":"gemini","weight":70},{"provider":"openai","weight":20},{"provider":"anthropic","weight":10}]

# 8. WEIGHTED - 50-50
PROVIDER_SELECTION_STRATEGY=WEIGHTED
PROVIDER_WEIGHTS=[{"provider":"gemini","weight":50},{"provider":"openai","weight":50}]

# 9. MESSAGE_BASED
PROVIDER_SELECTION_STRATEGY=MESSAGE_BASED