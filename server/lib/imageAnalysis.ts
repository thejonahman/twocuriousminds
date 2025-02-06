import fs from "fs";
import path from "path";

type Category = {
  weight: number;
  keywords: string[];
  synonyms?: { [key: string]: string[] };
};

type Categories = {
  [key: string]: Category;
};

// Content-based image matching with improved ski instruction categorization
export async function findBestImageForVideo(
  title: string,
  description: string,
  imagesFolder: string
): Promise<string | null> {
  try {
    // Get all images from the folder
    const files = fs.readdirSync(imagesFolder).filter(file =>
      /\.(jpg|jpeg|png|webp)$/i.test(file)
    );

    console.log('Analyzing content:', { title, description });

    // Enhanced categories with ski-specific terminology
    const categories: Categories = {
      skiing_technique: {
        weight: 1.0,
        keywords: [
          'ski', 'skiing', 'technique', 'form', 'posture',
          'turn', 'carve', 'edge', 'parallel', 'stance',
          'balance', 'movement', 'position', 'control'
        ],
        synonyms: {
          'turn': ['carving', 'steering', 'pivot'],
          'stance': ['position', 'posture', 'alignment'],
          'technique': ['form', 'method', 'approach']
        }
      },
      ski_terrain: {
        weight: 0.9,
        keywords: [
          'slope', 'run', 'trail', 'mogul', 'powder',
          'groomed', 'steep', 'flat', 'bump', 'conditions',
          'snow', 'ice', 'piste', 'off-piste'
        ]
      },
      ski_equipment: {
        weight: 0.8,
        keywords: [
          'boot', 'binding', 'pole', 'gear', 'equipment',
          'skis', 'helmet', 'goggles', 'wear', 'clothing',
          'jacket', 'pants', 'gloves'
        ]
      },
      ski_instruction: {
        weight: 1.0,
        keywords: [
          'lesson', 'teach', 'learn', 'instructor', 'beginner',
          'intermediate', 'advanced', 'expert', 'tutorial',
          'guide', 'tip', 'advice', 'demonstration'
        ]
      },
      ski_safety: {
        weight: 0.9,
        keywords: [
          'safety', 'precaution', 'fall', 'crash', 'injury',
          'prevention', 'protect', 'secure', 'emergency',
          'rescue', 'caution', 'warning'
        ]
      }
    };

    // Convert content to lowercase for matching
    const contentText = `${title} ${description}`.toLowerCase();
    console.log('Content text for matching:', contentText);

    // Enhanced matching algorithm
    // 1. First try exact phrase matches
    const phrases = contentText.match(/\b[\w\s]{3,}\b/g) || [];
    for (const phrase of phrases) {
      const exactMatch = files.find(file =>
        file.toLowerCase().includes(phrase.toLowerCase().replace(/\s+/g, ''))
      );
      if (exactMatch) {
        console.log('Found exact phrase match:', exactMatch, 'for phrase:', phrase);
        return exactMatch;
      }
    }

    // 2. Calculate category scores with synonym expansion
    const categoryScores = Object.entries(categories).map(([category, info]) => {
      let matchCount = 0;
      const totalKeywords = info.keywords.length;

      // Check direct keywords
      info.keywords.forEach(keyword => {
        const regex = new RegExp(`\\b${keyword}\\b`, 'i');
        if (regex.test(contentText)) {
          matchCount++;
        }
      });

      // Check synonyms if available
      if (info.synonyms) {
        Object.entries(info.synonyms).forEach(([mainWord, synonymList]) => {
          if (synonymList.some(synonym => {
            const regex = new RegExp(`\\b${synonym}\\b`, 'i');
            return regex.test(contentText);
          })) {
            matchCount++;
          }
        });
      }

      const score = (matchCount / totalKeywords) * info.weight;

      console.log(`Category "${category}" score:`, {
        matchCount,
        totalKeywords,
        weight: info.weight,
        score
      });

      return { category, score };
    });

    // Get best matching category
    const bestCategory = categoryScores.reduce((best, current) =>
      current.score > best.score ? current : best
    );

    console.log('Best matching category:', bestCategory);

    // Build prioritized patterns for matching
    const patterns = [
      // Exact category match
      new RegExp(`${bestCategory.category.replace('_', '')}`, 'i'),
      // Keywords from the category with high specificity
      ...categories[bestCategory.category].keywords.map(keyword =>
        new RegExp(`\\b${keyword}\\b`, 'i')
      ),
      // General ski-related patterns
      /ski/i, /snow/i, /winter/i,
      // Fallback patterns
      /sport/i, /outdoor/i, /activity/i
    ];

    // Find matching image with improved logging
    for (const pattern of patterns) {
      const matchingFiles = files.filter(file => pattern.test(file));
      if (matchingFiles.length > 0) {
        // Sort matches by filename length (shorter names often more relevant)
        const bestMatch = matchingFiles.sort((a, b) => a.length - b.length)[0];
        console.log('Found best matching file:', bestMatch, 'using pattern:', pattern);
        return bestMatch;
      }
    }

    // If no match found, use ski-specific default
    const defaultImage = files.find(file => /thumbnail_skiing\.jpg/i.test(file));
    if (defaultImage) {
      console.log('Using default skiing image:', defaultImage);
      return defaultImage;
    }

    // Final fallback
    console.log('No matching image found, will use SVG fallback');
    return null;

  } catch (error) {
    console.error('Error finding best image:', error);
    return null;
  }
}