import { Link } from "wouter";
import { Brain } from "lucide-react";

export default function Navbar() {
  return (
    <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center px-4">
        <Link href="/" className="flex items-center space-x-2">
          <Brain className="h-6 w-6 text-primary" />
          <span className="font-bold text-xl">CuriousMind</span>
        </Link>
      </div>
    </nav>
  );
}