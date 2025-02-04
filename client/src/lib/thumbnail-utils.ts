export const gradientMap: Record<string, string> = {
  math: "bg-gradient-to-br from-blue-600 to-purple-600",
  science: "bg-gradient-to-br from-green-600 to-teal-600",
  history: "bg-gradient-to-br from-amber-600 to-red-600",
  language: "bg-gradient-to-br from-pink-600 to-rose-600",
  technology: "bg-gradient-to-br from-indigo-600 to-sky-600",
  arts: "bg-gradient-to-br from-violet-600 to-fuchsia-600",
  default: "bg-gradient-to-br from-gray-600 to-slate-800"
};

export const platformPatterns = {
  youtube: /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/,
  tiktok: /^(https?:\/\/)?(www\.)?(tiktok\.com)\/.+$/,
  instagram: /^(https?:\/\/)?(www\.)?(instagram\.com)\/.+$/
};

export function detectPlatform(url: string): string | null {
  for (const [platform, pattern] of Object.entries(platformPatterns)) {
    if (pattern.test(url)) {
      return platform;
    }
  }
  return null;
}
