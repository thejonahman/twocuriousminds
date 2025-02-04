import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="min-h-[80vh] w-full flex items-center justify-center">
      <Card className="w-full max-w-md mx-4 shadow-lg">
        <CardContent className="p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 mb-6">
            <AlertCircle className="h-12 w-12 text-destructive" />
            <div className="text-center sm:text-left">
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">
                404 Page Not Found
              </h1>
              <p className="text-sm sm:text-base text-muted-foreground">
                The page you're looking for doesn't exist or has been moved.
              </p>
            </div>
          </div>
          <div className="flex justify-center sm:justify-start">
            <Button asChild variant="default">
              <Link href="/">
                Return Home
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}