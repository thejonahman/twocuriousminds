import { SiYoutube, SiTiktok, SiInstagram } from "react-icons/si";
import { Badge } from "@/components/ui/badge";

interface PlatformIconProps {
  platform: string;
}

export function PlatformIcon({ platform }: PlatformIconProps) {
  const iconMap = {
    youtube: {
      Icon: SiYoutube,
      color: "bg-red-500",
    },
    tiktok: {
      Icon: SiTiktok,
      color: "bg-black",
    },
    instagram: {
      Icon: SiInstagram,
      color: "bg-pink-500",
    },
  };

  const { Icon, color } = iconMap[platform as keyof typeof iconMap] || {};
  
  if (!Icon) return null;

  return (
    <Badge className={`${color} text-white`}>
      <Icon className="h-4 w-4" />
    </Badge>
  );
}
