import fs from "fs";
import path from "path";

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

    // Enhanced categories with domain-specific keywords and synonyms
    const categories = {
      animals: {
        weight: 1.0,
        keywords: [
          'animal', 'bird', 'falcon', 'eagle', 'hawk', 'predator',
          'prey', 'hunt', 'flight', 'wings', 'target', 'tracking',
          'vision', 'nature', 'wildlife', 'behavior'
        ]
      },
      psychology: {
        weight: 0.9,
        keywords: [
          'psychology', 'mind', 'behavior', 'mental', 'cognitive',
          'attention', 'focus', 'target', 'concentration', 'perception',
          'tracking', 'learning', 'instinct', 'ability'
        ]
      },
      science: {
        weight: 0.8,
        keywords: [
          'science', 'biology', 'research', 'study', 'observation',
          'analysis', 'data', 'tracking', 'measurement', 'precision',
          'accuracy', 'mechanism', 'system', 'function'
        ]
      }
    } as const;

    // Convert content to lowercase for matching
    const contentText = `${title} ${description}`.toLowerCase();
    console.log('Content text for matching:', contentText);

    // First try exact matches from common filenames
    const exactMatches = {
      'falcon': /falcon|bird|prey/i,
      'tracking': /track|target/i,
      'vision': /vision|sight|eye/i,
      'flight': /flight|fly|air/i
    };

    for (const [category, pattern] of Object.entries(exactMatches)) {
      if (pattern.test(contentText)) {
        const match = files.find(file => 
          file.toLowerCase().includes(category.toLowerCase())
        );
        if (match) {
          console.log('Found exact category match:', match, 'for category:', category);
          return match;
        }
      }
    }

    // Try specific image patterns based on content
    const specificImagePatterns = [
      { pattern: /falcon.*target/i, priority: ['falcon', 'bird', 'prey'] },
      { pattern: /track.*movement/i, priority: ['tracking', 'motion'] },
      { pattern: /vision|sight/i, priority: ['eye', 'vision', 'sight'] },
      { pattern: /flight|flying/i, priority: ['flight', 'air', 'sky'] }
    ];

    for (const { pattern, priority } of specificImagePatterns) {
      if (pattern.test(contentText)) {
        for (const term of priority) {
          const match = files.find(file => 
            file.toLowerCase().includes(term.toLowerCase())
          );
          if (match) {
            console.log('Found specific match:', match, 'for pattern:', pattern);
            return match;
          }
        }
      }
    }

    // Calculate category scores with improved matching
    const categoryScores = Object.entries(categories).map(([category, info]) => {
      const matchingKeywords = info.keywords.filter(keyword => {
        const regex = new RegExp(`\\b${keyword}\\b`, 'i');
        return regex.test(contentText);
      });

      const score = (matchingKeywords.length / info.keywords.length) * info.weight;

      console.log(`Category "${category}" score:`, {
        matchingKeywords,
        score
      });

      return { category, score, matchingKeywords };
    });

    // Get best matching category with minimum threshold
    const bestCategory = categoryScores.reduce((best, current) =>
      current.score > best.score ? current : best
    );

    console.log('Best matching category:', bestCategory);

    // If we have a good category match, look for related images
    if (bestCategory.score > 0.1) {
      for (const keyword of bestCategory.matchingKeywords) {
        const match = files.find(file => 
          file.toLowerCase().includes(keyword.toLowerCase())
        );
        if (match) {
          console.log('Found category-based match:', match);
          return match;
        }
      }
    }

    // Try generic nature/wildlife images as fallback
    const fallbackPatterns = [
      /nature/i,
      /wildlife/i,
      /animal/i,
      /bird/i,
      /thumbnail_default\.(jpg|jpeg|png|webp)$/i
    ];

    for (const pattern of fallbackPatterns) {
      const match = files.find(file => pattern.test(file));
      if (match) {
        console.log('Using fallback image:', match);
        return match;
      }
    }

    console.log('No matching image found, will use SVG fallback');
    return null;

  } catch (error) {
    console.error('Error finding best image:', error);
    return null;
  }
}