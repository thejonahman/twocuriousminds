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
    thumbnailUrl: "/attached_assets/photo-1522056615691-da7b8106c665.jpeg", // Fashion/retail themed image
  },
  {
    id: "2",
    title: "Grocery store competitive tactic",
    category: "General",
    thumbnailUrl: "/attached_assets/photo-1513673054901-2b5f51551112.jpeg", // Retail/store themed image
  },
  {
    id: "3", 
    title: "Buffet and Morningstar business moats",
    category: "General",
    thumbnailUrl: "/attached_assets/photo-1460925895917-afdab827c52f.jpeg", // Business/finance themed image
  }
];