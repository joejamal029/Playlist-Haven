import type { CanonicalBucket } from './classificationEngine';

export interface AreaResolution {
  bucket: CanonicalBucket;
  country?: string;
  countryName?: string;
}

/**
 * Canonical region and metropolitan keywords mapping to canonical language/cultural buckets.
 * Used by Tier 2 to resolve artists with city or state tags on MusicBrainz when ISO country is absent.
 */
export const AREA_MAP: Array<{ patterns: string[]; result: AreaResolution }> = [
  // United States (States + major music metros)
  {
    patterns: [
      'united states', 'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado',
      'connecticut', 'delaware', 'florida', 'georgia', 'hawaii', 'idaho', 'illinois',
      'indiana', 'iowa', 'kansas', 'kentucky', 'louisiana', 'maine', 'maryland',
      'massachusetts', 'michigan', 'minnesota', 'mississippi', 'missouri', 'montana',
      'nebraska', 'nevada', 'new hampshire', 'new jersey', 'new mexico', 'new york',
      'north carolina', 'north dakota', 'ohio', 'oklahoma', 'oregon', 'pennsylvania',
      'rhode island', 'south carolina', 'south dakota', 'tennessee', 'texas', 'utah',
      'vermont', 'virginia', 'washington', 'west virginia', 'wisconsin', 'wyoming',
      'district of columbia', 'los angeles', 'chicago', 'houston', 'phoenix', 'philadelphia',
      'san antonio', 'san diego', 'dallas', 'austin', 'san jose', 'fort worth', 'columbus',
      'charlotte', 'indianapolis', 'san francisco', 'seattle', 'denver', 'boston', 'nashville',
      'detroit', 'portland', 'las vegas', 'memphis', 'louisville', 'baltimore', 'milwaukee',
      'albuquerque', 'tucson', 'fresno', 'sacramento', 'kansas city', 'atlanta', 'omaha',
      'raleigh', 'miami', 'oakland', 'minneapolis', 'tulsa', 'tampa', 'wichita', 'arlington',
      'redding', 'brooklyn', 'manhattan', 'queens', 'bronx', 'staten island'
    ],
    result: { bucket: 'English', country: 'US', countryName: 'United States' }
  },
  // Australia (States + major cities)
  {
    patterns: [
      'australia', 'new south wales', 'victoria', 'queensland', 'western australia',
      'south australia', 'tasmania', 'northern territory', 'australian capital territory',
      'sydney', 'melbourne', 'brisbane', 'perth', 'adelaide', 'gold coast', 'canberra',
      'newcastle', 'wollongong', 'geelong', 'hobart', 'cairns', 'darwin'
    ],
    result: { bucket: 'English', country: 'AU', countryName: 'Australia' }
  },
  // Canada (Provinces + major cities)
  {
    patterns: [
      'canada', 'ontario', 'quebec', 'british columbia', 'alberta', 'manitoba',
      'saskatchewan', 'nova scotia', 'new brunswick', 'newfoundland', 'prince edward island',
      'toronto', 'montreal', 'vancouver', 'calgary', 'edmonton', 'ottawa', 'winnipeg',
      'quebec city', 'hamilton', 'kitchener', 'victoria', 'halifax'
    ],
    result: { bucket: 'English', country: 'CA', countryName: 'Canada' }
  },
  // United Kingdom
  {
    patterns: [
      'united kingdom', 'great britain', 'england', 'scotland', 'wales', 'northern ireland',
      'london', 'manchester', 'birmingham', 'leeds', 'glasgow', 'liverpool',
      'newcastle', 'sheffield', 'bristol', 'belfast', 'edinburgh', 'cardiff', 'whitechapel'
    ],
    result: { bucket: 'English', country: 'GB', countryName: 'United Kingdom' }
  },
  // Japan
  {
    patterns: [
      'japan', 'tokyo', 'osaka', 'kyoto', 'yokohama', 'nagoya', 'sapporo', 'kobe',
      'fukuoka', 'kawasaki', 'saitama', 'hiroshima', 'sendai', 'chiba', 'kitakyushu',
      'shizuoka', 'sakai', 'niigata', 'hamamatsu', 'okayama', 'kumamoto', 'uji',
      'nara', 'kanazawa', 'kagoshima', 'okinawa', 'hokkaido', 'aichi', 'hyogo'
    ],
    result: { bucket: 'J-Pop', country: 'JP', countryName: 'Japan' }
  },
  // South Korea
  {
    patterns: [
      'south korea', 'korea', 'seoul', 'busan', 'incheon', 'daegu', 'daejeon',
      'gwangju', 'suwon', 'ulsan', 'changwon', 'goyang', 'yongin', 'seongnam', 'jeju'
    ],
    result: { bucket: 'K-Pop', country: 'KR', countryName: 'South Korea' }
  },
  // Greater China (China, Taiwan, Hong Kong, Macau)
  {
    patterns: [
      'taiwan', 'china', 'hong kong', 'macau', 'beijing', 'shanghai', 'guangzhou',
      'shenzhen', 'chengdu', 'hangzhou', 'wuhan', 'taipei', 'kaohsiung', 'taichung',
      'tainan', 'new taipei', 'kowloon'
    ],
    result: { bucket: 'C-Pop', country: 'CN', countryName: 'China / Taiwan / Hong Kong' }
  },
  // Philippines
  {
    patterns: [
      'philippines', 'manila', 'quezon city', 'davao', 'caloocan', 'cebu', 'zamboanga',
      'taguig', 'pasig', 'cagayan de oro', 'parañaque', 'makati', 'bacolod', 'iloilo',
      'pampanga', 'cavite', 'laguna', 'batangas', 'rizal', 'bulacan'
    ],
    result: { bucket: 'Filipino', country: 'PH', countryName: 'Philippines' }
  },
  // Nigeria
  {
    patterns: [
      'nigeria', 'lagos', 'abuja', 'port harcourt', 'ibadan', 'benin city', 'kano',
      'kaduna', 'enugu', 'calabar', 'warri', 'jos', 'ilorin', 'owerri', 'uyo',
      'anambra', 'imo', 'delta', 'edo', 'ogun', 'oyo', 'rivers'
    ],
    result: { bucket: 'Naija', country: 'NG', countryName: 'Nigeria' }
  },
  // Latina & Spanish
  {
    patterns: [
      'puerto rico', 'colombia', 'spain', 'mexico', 'argentina', 'chile', 'peru',
      'venezuela', 'cuba', 'dominican republic', 'ecuador', 'guatemala', 'costa rica',
      'panama', 'bogota', 'medellin', 'buenos aires', 'santiago', 'lima', 'madrid',
      'barcelona', 'san juan', 'guadalajara', 'monterrey', 'mexico city', 'caracas',
      'havana', 'santo domingo'
    ],
    result: { bucket: 'Latina', country: 'Latina', countryName: 'Latin America / Spain' }
  },
  // France / Francophone
  {
    patterns: [
      'france', 'paris', 'marseille', 'lyon', 'toulouse', 'nice', 'nantes',
      'montpellier', 'strasbourg', 'bordeaux', 'lille', 'brussels'
    ],
    result: { bucket: 'Français', country: 'FR', countryName: 'France' }
  },
  // Germany / German-speaking
  {
    patterns: [
      'germany', 'austria', 'berlin', 'munich', 'hamburg', 'frankfurt', 'cologne',
      'stuttgart', 'düsseldorf', 'leipzig', 'dortmund', 'essen', 'bremen', 'dresden',
      'hanover', 'vienna', 'zurich'
    ],
    result: { bucket: 'German', country: 'DE', countryName: 'Germany' }
  },
  // Italy
  {
    patterns: [
      'italy', 'rome', 'milan', 'naples', 'turin', 'palermo', 'genoa', 'bologna',
      'florence', 'bari', 'catania', 'venice', 'verona'
    ],
    result: { bucket: 'Italian', country: 'IT', countryName: 'Italy' }
  },
  // Brazil & Portugal
  {
    patterns: [
      'brazil', 'brasil', 'portugal', 'angola', 'mozambique', 'são paulo', 'sao paulo',
      'rio de janeiro', 'salvador', 'fortaleza', 'belo horizonte', 'brasília', 'brasilia',
      'curitiba', 'manaus', 'recife', 'belém', 'belem', 'porto alegre', 'lisbon', 'porto'
    ],
    result: { bucket: 'Portuguese', country: 'BR', countryName: 'Brazil / Portugal' }
  },
  // Thailand
  {
    patterns: [
      'thailand', 'bangkok', 'chiang mai', 'phuket', 'pattaya', 'nonthaburi', 'hat yai'
    ],
    result: { bucket: 'Thai', country: 'TH', countryName: 'Thailand' }
  },
  // Vietnam
  {
    patterns: [
      'vietnam', 'ho chi minh', 'hanoi', 'da nang', 'hai phong', 'can tho'
    ],
    result: { bucket: 'Vietnamese', country: 'VN', countryName: 'Vietnam' }
  },
  // Netherlands
  {
    patterns: [
      'netherlands', 'amsterdam', 'rotterdam', 'the hague', 'utrecht', 'eindhoven',
      'tilburg', 'groningen', 'almere', 'breda', 'nijmegen'
    ],
    result: { bucket: 'Dutch', country: 'NL', countryName: 'Netherlands' }
  },
  // Arabic
  {
    patterns: [
      'egypt', 'lebanon', 'saudi arabia', 'uae', 'united arab emirates', 'morocco',
      'algeria', 'tunisia', 'jordan', 'iraq', 'syria', 'kuwait', 'oman', 'qatar',
      'bahrain', 'libya', 'sudan', 'yemen', 'palestine', 'cairo', 'alexandria',
      'beirut', 'riyadh', 'jeddah', 'dubai', 'abu dhabi', 'casablanca', 'rabat', 'amman'
    ],
    result: { bucket: 'Arabic', country: 'Arabic', countryName: 'Middle East / North Africa' }
  },
  // Indian subcontinent
  {
    patterns: [
      'india', 'pakistan', 'bangladesh', 'sri lanka', 'nepal', 'mumbai', 'delhi',
      'bangalore', 'bengaluru', 'hyderabad', 'chennai', 'kolkata', 'ahmedabad', 'pune',
      'punjab', 'kerala', 'tamil nadu', 'maharashtra'
    ],
    result: { bucket: 'I-Pop', country: 'IN', countryName: 'India' }
  },
  // African (continental, non-Nigerian)
  {
    patterns: [
      'south africa', 'ghana', 'kenya', 'tanzania', 'uganda', 'zimbabwe', 'congo',
      'ethiopia', 'cameroon', 'senegal', 'ivory coast', 'johannesburg', 'cape town',
      'durban', 'nairobi', 'accra', 'kinshasa', 'dakar', 'kampala', 'addis ababa'
    ],
    result: { bucket: 'African', country: 'African', countryName: 'Africa' }
  }
];

export function resolveAreaToBucket(areaText: string): AreaResolution | null {
  if (!areaText) return null;
  const lower = areaText.toLowerCase().trim();
  for (const entry of AREA_MAP) {
    for (const pattern of entry.patterns) {
      if (lower === pattern || lower.includes(pattern)) {
        return entry.result;
      }
    }
  }
  return null;
}
