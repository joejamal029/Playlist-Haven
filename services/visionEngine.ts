import { GoogleGenAI, Type } from "@google/genai";

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export interface ExtractedSong {
  artist: string;
  title: string;
  album?: string;
}

export interface AggregatedSong {
  id: string; // Unique identifier for UI selection
  artist: string;
  title: string;
  album: string;
  count: number;
  sources: Set<string>;
}

// Experimental Interfaces
export interface ArtContextSong {
  title: string;
  listed_artist: string;
  art_description: string;
}

export interface EnrichedSong {
  title: string;
  artist: string;
  album: string;
  confidence: 'high' | 'medium' | 'low';
  search_url?: string;
}

// Helper: Smart Retry with Exponential Backoff
const smartRetry = async <T>(
  operation: () => Promise<T>,
  maxRetries: number = 5,
  baseDelay: number = 1000
): Promise<T> => {
  let lastError: any;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      const msg = error?.message || "";
      
      // Identify transient errors (Rate Limits, Server Errors, Network Issues)
      const isTransient = 
        msg.includes("429") || 
        msg.includes("503") || 
        msg.includes("500") || 
        msg.includes("overloaded") || 
        msg.includes("fetch failed") ||
        msg.includes("xhr error") ||
        msg.includes("error code: 6");

      if (attempt < maxRetries - 1 && isTransient) {
        // Exponential backoff with jitter: 1s, 2s, 4s, 8s... + random ms
        const delay = baseDelay * Math.pow(2, attempt) + (Math.random() * 500);
        console.warn(`Attempt ${attempt + 1} failed (Transient). Retrying in ${Math.round(delay)}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // If it's not transient (e.g. 400 Bad Request) or max retries reached, break loop
      if (!isTransient) break;
    }
  }
  
  throw lastError;
};

// Helper: Convert File to Base64 with compression for large images
const fileToGenerativePart = async (file: File): Promise<{ data: string, mimeType: string }> => {
  return new Promise((resolve, reject) => {
    // If it's not an image or it's small enough (< 2MB), just read it directly
    if (!file.type.startsWith('image/') || file.size < 2 * 1024 * 1024) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        resolve({ data: result.split(',')[1], mimeType: file.type || "image/png" });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
      return;
    }

    // For larger images, compress them using canvas
    const img = new Image();
    const reader = new FileReader();
    
    reader.onload = (e) => {
      img.src = e.target?.result as string;
    };
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      // Max dimension 2048 to preserve text readability while reducing size
      const MAX_DIMENSION = 2048;
      let width = img.width;
      let height = img.height;

      if (width > height && width > MAX_DIMENSION) {
        height *= MAX_DIMENSION / width;
        width = MAX_DIMENSION;
      } else if (height > MAX_DIMENSION) {
        width *= MAX_DIMENSION / height;
        height = MAX_DIMENSION;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        // Fallback to original if canvas fails
        resolve({ data: (reader.result as string).split(',')[1], mimeType: file.type || "image/png" });
        return;
      }
      
      ctx.drawImage(img, 0, 0, width, height);
      // Compress to JPEG with 0.8 quality
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      resolve({ data: dataUrl.split(',')[1], mimeType: "image/jpeg" });
    };
    
    img.onerror = () => {
      // Fallback to original if image loading fails
      resolve({ data: (reader.result as string).split(',')[1], mimeType: file.type || "image/png" });
    };
    
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

// Helper: Levenshtein Distance for Fuzzy Matching
const levenshteinDistance = (a: string, b: string): number => {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
};

const getSimilarity = (s1: string, s2: string): number => {
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  if (longer.length === 0) return 1.0;
  return (longer.length - levenshteinDistance(longer, shorter)) / longer.length;
};

// Helper: Normalize String (Remove punctuation, feat., remix, lowercase)
const normalize = (str: string): string => {
  if (!str) return "";
  return str
    .toLowerCase()
    .replace(/\(.*\)|\[.*\]/g, "") // Remove (...) and [...]
    .replace(/feat\.|ft\.|remix|radio edit/g, "")
    .replace(/[^\w\s]/g, "") // Remove punctuation
    .trim();
};

/**
 * PHASE 1: Vision Parsing (Standard)
 * Extract songs from a single screenshot using Gemini
 */
export const parseScreenshot = async (file: File): Promise<ExtractedSong[]> => {
  return smartRetry(async () => {
    try {
      const part = await fileToGenerativePart(file);

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: part.mimeType,
                data: part.data
              }
            },
            {
              text: `Analyze this playlist screenshot. Extract a list of songs. 
              Ignore UI elements (time, battery, navigation, duration). 
              If a song is cut off at the bottom, ignore it.
              Return ONLY a JSON array where each object has 'artist', 'title', and 'album'.
              If album is not visible, leave it empty. No markdown formatting.`
            }
          ]
        }
      });

      let text = response.text || "[]";
      text = text.replace(/```json/g, '').replace(/```/g, '').trim();
      
      try {
        const data = JSON.parse(text);
        return Array.isArray(data) ? data : [];
      } catch (e) {
        console.error("Failed to parse JSON from vision response:", text);
        return [];
      }
    } catch (error) {
      console.error("Gemini Vision Error:", error);
      throw error; // Re-throw for smartRetry to catch
    }
  });
};

/**
 * EXPERIMENTAL: Vision Parsing with Art Description
 * Used when text metadata is incomplete (missing artist) but artwork is present.
 */
export const parseScreenshotWithArt = async (file: File): Promise<ArtContextSong[]> => {
  return smartRetry(async () => {
    try {
      const part = await fileToGenerativePart(file);

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: part.mimeType,
                data: part.data
              }
            },
            {
              text: `Analyze this playlist screenshot. 
              For EACH visible song entry, extract:
              1. 'title' (the larger text)
              2. 'listed_artist' (the smaller text - note if it looks like a duplicate of the title)
              3. 'art_description': A detailed visual description of the album artwork (colors, objects, style, text if any).
              
              Return ONLY a JSON array with these exact keys, no markdown formatting.`
            }
          ]
        }
      });

      let text = response.text || "[]";
      text = text.replace(/```json/g, '').replace(/```/g, '').trim();
      
      try {
        const data = JSON.parse(text);
        return Array.isArray(data) ? data : [];
      } catch (e) {
        console.error("Failed to parse JSON from vision response:", text);
        return [];
      }
    } catch (error) {
      console.error("Gemini Experimental Vision Error:", error);
      throw error;
    }
  });
};

/**
 * EXPERIMENTAL: Search-Based Metadata Enrichment
 * Uses Google Search Grounding to find the Artist/Album using Title + Art Description
 */
export const enrichMetadataWithSearch = async (song: ArtContextSong): Promise<EnrichedSong> => {
  return smartRetry(async () => {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Find the correct music metadata for this song.
        
        Known Title: "${song.title}"
        Listed Artist (likely incorrect/missing): "${song.listed_artist}"
        Album Artwork Visual Description: ${song.art_description}
        
        Search the web to find the correct Artist and Album name that matches this title and artwork description.
        
        Return ONLY a JSON object with this exact structure, no markdown formatting or other text:
        { "artist": "string", "album": "string", "title": "string", "confidence": "high" | "medium" | "low" }`,
        config: {
          tools: [{ googleSearch: {} }]
        }
      });

      let text = response.text || "{}";
      // Clean up markdown formatting if the model still includes it
      text = text.replace(/```json/g, '').replace(/```/g, '').trim();
      
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch (e) {
        console.error("Failed to parse JSON from search response:", text);
      }
      
      // Extract a relevant URL if available
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      let search_url = "";
      if (chunks && chunks.length > 0) {
        // Try to find a chunk with a web URI
        const webChunk = chunks.find((c: any) => c.web?.uri);
        if (webChunk) search_url = webChunk.web.uri;
      }

      return {
        title: data.title || song.title,
        artist: data.artist || "",
        album: data.album || "",
        confidence: data.confidence || "low",
        search_url
      };

    } catch (error) {
      console.error("Metadata Enrichment Error:", error);
      throw error;
    }
  });
};

/**
 * PHASE 2: Aggregation
 * Aggregate and deduplicate songs from multiple sources
 */
export const aggregateSongs = (
  allExtracted: { song: ExtractedSong, source: string }[]
): AggregatedSong[] => {
  const aggregated: AggregatedSong[] = [];

  for (const item of allExtracted) {
    const normTitle = normalize(item.song.title);
    const normArtist = normalize(item.song.artist);
    
    // Attempt to find a match in existing aggregated list
    let match = aggregated.find(agg => {
        const aggTitle = normalize(agg.title);
        const aggArtist = normalize(agg.artist);
        
        // Strict artist check (high similarity) + Loose title check (fuzzy)
        const artistSim = getSimilarity(aggArtist, normArtist);
        const titleSim = getSimilarity(aggTitle, normTitle);
        
        return artistSim > 0.85 && titleSim > 0.85;
    });

    if (match) {
      match.count++;
      match.sources.add(item.source);
      // Prefer the version with an Album if the match didn't have one
      if (!match.album && item.song.album) {
          match.album = item.song.album;
      }
    } else {
      aggregated.push({
        id: btoa(unescape(encodeURIComponent(`${normArtist}-${normTitle}`))), // Safe Base64 ID
        artist: item.song.artist,
        title: item.song.title,
        album: item.song.album || "",
        count: 1,
        sources: new Set([item.source])
      });
    }
  }

  // Sort by count descending
  return aggregated.sort((a, b) => b.count - a.count);
};

/**
 * PHASE 3: Export
 * Generate CSV for Tune My Music
 */
export const generateCSV = (songs: AggregatedSong[] | EnrichedSong[]): string => {
  // Header required by Tune My Music: Artist,Track,Album
  let csv = "Artist,Track,Album\n";
  
  songs.forEach(song => {
    // Escape commas in fields
    const artist = song.artist.includes(',') ? `"${song.artist}"` : song.artist;
    const title = song.title.includes(',') ? `"${song.title}"` : song.title;
    const album = song.album.includes(',') ? `"${song.album}"` : song.album;
    
    csv += `${artist},${title},${album}\n`;
  });
  
  return csv;
};