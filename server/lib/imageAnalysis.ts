import fs from "fs";
import path from "path";

// Content-based image matching with improved categorization
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

    // Enhanced categories with domain-specific keywords
    const categories = {
      skiing: {
        weight: 1.0,
        keywords: [
          'ski', 'skiing', 'slope', 'snow', 'mountain',
          'technique', 'turn', 'parallel', 'mogul', 'carving',
          'jump', 'alpine', 'downhill', 'piste', 'powder',
          'beginner', 'advanced', 'intermediate', 'lesson'
        ]
      },
      psychology: {
        weight: 0.9,
        keywords: [
          'psychology', 'mind', 'behavior', 'mental', 'cognitive',
          'emotion', 'thinking', 'brain', 'personality', 'development',
          'learning', 'memory', 'attention', 'motivation', 'perception',
          'adhd', 'focus', 'concentration', 'habit'
        ]
      },
      science: {
        weight: 0.8,
        keywords: [
          'science', 'physics', 'chemistry', 'biology', 'experiment',
          'research', 'study', 'theory', 'principle', 'method',
          'laboratory', 'observation', 'analysis', 'data'
        ]
      },
      business: {
        weight: 0.7,
        keywords: [
          'business', 'economics', 'finance', 'market', 'management',
          'strategy', 'leadership', 'organization', 'planning', 'decision',
          'entrepreneur', 'startup', 'company', 'corporate'
        ]
      }
    } as const;

    // Convert content to lowercase for matching
    const contentText = `${title} ${description}`.toLowerCase();
    console.log('Content text for matching:', contentText);

    // First try exact matches from the README naming convention
    const exactMatches = {
      'skiing': /thumbnail_skiing\.(jpg|jpeg|png|webp)$/i,
      'psychology': /thumbnail_psychology\.(jpg|jpeg|png|webp)$/i,
      'learning': /thumbnail_learning\.(jpg|jpeg|png|webp)$/i,
      'business': /thumbnail_business\.(jpg|jpeg|png|webp)$/i,
      'science': /thumbnail_science\.(jpg|jpeg|png|webp)$/i
    };

    for (const [category, pattern] of Object.entries(exactMatches)) {
      if (contentText.includes(category)) {
        const match = files.find(file => pattern.test(file));
        if (match) {
          console.log('Found exact category match:', match, 'for category:', category);
          return match;
        }
      }
    }

    // Try activity-specific image matches
    const specificImagePatterns = [
      /parallel.*ski/i,
      /moguls?/i,
      /jump.*turn/i,
      /adhd/i,
      /burnout/i,
      /dense.*air/i
    ];

    for (const pattern of specificImagePatterns) {
      if (pattern.test(contentText)) {
        const match = files.find(file => pattern.test(file));
        if (match) {
          console.log('Found specific activity match:', match, 'for pattern:', pattern);
          return match;
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
      const categoryPattern = new RegExp(bestCategory.matchingKeywords.join('|'), 'i');
      const matchingFile = files.find(file => categoryPattern.test(file));
      if (matchingFile) {
        console.log('Found category-based match:', matchingFile);
        return matchingFile;
      }
    }

    // If no match found, try to find a contextually relevant image
    const contextPatterns = [
      /background/i,
      /default/i,
      /general/i,
      /thumbnail_default\.(jpg|jpeg|png|webp)$/i
    ];

    for (const pattern of contextPatterns) {
      const matchingFile = files.find(file => pattern.test(file));
      if (matchingFile) {
        console.log('Using contextual fallback image:', matchingFile);
        return matchingFile;
      }
    }

    // Return null if no match found
    console.log('No matching image found, will use SVG fallback');
    return null;

  } catch (error) {
    console.error('Error finding best image:', error);
    return null;
  }
}