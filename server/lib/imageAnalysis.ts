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
      science: {
        weight: 1.0,
        keywords: [
          'science', 'physics', 'chemistry', 'biology', 'experiment',
          'air', 'density', 'pressure', 'temperature', 'gas',
          'molecule', 'particle', 'atmosphere', 'research', 'study'
        ]
      },
      education: {
        weight: 0.9,
        keywords: [
          'learn', 'teach', 'education', 'school', 'classroom',
          'lecture', 'lesson', 'study', 'concept', 'understand',
          'explain', 'demonstrate', 'example', 'theory'
        ]
      },
      sports: {
        weight: 0.8,
        keywords: [
          'sport', 'exercise', 'training', 'fitness', 'practice',
          'technique', 'skill', 'movement', 'performance', 'athletic',
          'competition', 'game', 'match', 'player'
        ]
      },
      technology: {
        weight: 0.8,
        keywords: [
          'technology', 'digital', 'computer', 'software', 'hardware',
          'device', 'system', 'network', 'data', 'programming',
          'app', 'application', 'internet', 'electronic'
        ]
      },
      nature: {
        weight: 0.7,
        keywords: [
          'nature', 'environment', 'climate', 'weather', 'earth',
          'sky', 'cloud', 'wind', 'storm', 'temperature',
          'season', 'atmospheric', 'outdoor', 'natural'
        ]
      }
    };

    // Convert content to lowercase for matching
    const contentText = `${title} ${description}`.toLowerCase();
    console.log('Content text for matching:', contentText);

    // First try exact word matches from filename
    const words = contentText.split(/\s+/);
    for (const word of words) {
      if (word.length > 3) { // Skip short words
        const exactMatch = files.find(file =>
          file.toLowerCase().includes(word.toLowerCase())
        );
        if (exactMatch) {
          console.log('Found exact word match:', exactMatch, 'for word:', word);
          return exactMatch;
        }
      }
    }

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
      )
    ];

    // Find matching image
    for (const pattern of patterns) {
      const matchingFile = files.find(file => pattern.test(file));
      if (matchingFile) {
        console.log('Found matching file:', matchingFile, 'using pattern:', pattern);
        return matchingFile;
      }
    }

    // If no match found, use generic patterns based on content
    const genericPatterns = [
      /background/i, /texture/i, /pattern/i,
      /abstract/i, /general/i, /default/i
    ];

    for (const pattern of genericPatterns) {
      const matchingFile = files.find(file => pattern.test(file));
      if (matchingFile) {
        console.log('Using generic image:', matchingFile);
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