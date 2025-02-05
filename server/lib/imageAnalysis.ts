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

    // Enhanced categories with weighted keywords
    const categories = {
      technique: {
        weight: 1.0,
        keywords: [
          'turn', 'posture', 'position', 'stance', 'form', 'technique', 
          'ski', 'skiing', 'carve', 'edge', 'parallel', 'movement',
          'balance', 'control', 'lean', 'weight', 'shift'
        ]
      },
      beginner: {
        weight: 0.9,
        keywords: [
          'basic', 'beginner', 'start', 'learning', 'first', 'new',
          'introduction', 'fundamental', 'easy', 'simple', 'initial',
          'starting', 'novice', 'practice'
        ]
      },
      advanced: {
        weight: 0.8,
        keywords: [
          'advanced', 'expert', 'professional', 'steep', 'difficult',
          'challenging', 'mogul', 'powder', 'off-piste', 'jump',
          'trick', 'speed', 'race', 'competition'
        ]
      },
      equipment: {
        weight: 0.7,
        keywords: [
          'gear', 'equipment', 'boot', 'ski', 'pole', 'binding',
          'helmet', 'goggle', 'jacket', 'pants', 'glove', 'wax',
          'maintenance', 'setup', 'adjust'
        ]
      },
      safety: {
        weight: 1.0,
        keywords: [
          'safety', 'precaution', 'warning', 'careful', 'protect',
          'avalanche', 'rescue', 'emergency', 'caution', 'risk',
          'injury', 'prevention', 'secure', 'check'
        ]
      },
      environment: {
        weight: 0.6,
        keywords: [
          'mountain', 'snow', 'weather', 'condition', 'terrain',
          'slope', 'trail', 'peak', 'valley', 'resort', 'alpine',
          'glacier', 'powder', 'groomed'
        ]
      }
    };

    // Convert content to lowercase for matching
    const contentText = `${title} ${description}`.toLowerCase();
    console.log('Content text for matching:', contentText);

    // Calculate category scores
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

      return { category, score };
    });

    // Get best matching category
    const bestCategory = categoryScores.reduce((best, current) => 
      current.score > best.score ? current : best
    );

    console.log('Best matching category:', bestCategory);

    // Build regex patterns for the best category
    const patterns = [
      // Exact category name match
      new RegExp(`${bestCategory.category}`, 'i'),
      // Keywords from the category
      ...categories[bestCategory.category].keywords.map(keyword => 
        new RegExp(keyword, 'i')
      ),
      // Compound patterns
      new RegExp(`${bestCategory.category}.*?(${
        categories[bestCategory.category].keywords.join('|')
      })`, 'i')
    ];

    // Find matching image
    for (const pattern of patterns) {
      const matchingFile = files.find(file => pattern.test(file));
      if (matchingFile) {
        console.log('Found matching file:', matchingFile, 'using pattern:', pattern);
        return matchingFile;
      }
    }

    // If no specific match, try environment/general images
    const generalPatterns = [/ski/i, /snow/i, /mountain/i, /slope/i];
    for (const pattern of generalPatterns) {
      const matchingFile = files.find(file => pattern.test(file));
      if (matchingFile) {
        console.log('Using general image:', matchingFile);
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