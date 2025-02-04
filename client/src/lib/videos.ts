export interface Video {
  id: string;
  title: string;
  category: 'Startups' | 'General';
  thumbnailUrl: string;
}

export const videos: Video[] = [
  {
    id: "1",
    title: "Rent the runway - good or bad business",
    category: "Startups",
    thumbnailUrl: "https://images.unsplash.com/photo-1612423284934-2850a4ea6b0f?w=800&auto=format&fit=crop&q=60",
  },
  {
    id: "2",
    title: "Grocery store competitive tactic",
    category: "General",
    thumbnailUrl: "https://images.unsplash.com/photo-1579113800032-c38bd7635818?w=800&auto=format&fit=crop&q=60",
  },
  {
    id: "3", 
    title: "Buffet and Morningstar business moats",
    category: "General",
    thumbnailUrl: "https://images.unsplash.com/photo-1604594849809-dfedbc827105?w=800&auto=format&fit=crop&q=60",
  }
];
