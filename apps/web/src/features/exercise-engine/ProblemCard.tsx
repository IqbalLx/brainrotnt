import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { Problem } from "./useNextProblem";

export function ProblemCard({ problem, error, onNext }: { problem: Problem | null; error: string | null; onNext: () => void }) {
  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Can't reach the bridge</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button variant="outline" onClick={onNext}>
            Retry
          </Button>
        </CardFooter>
      </Card>
    );
  }

  if (!problem) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{problem.subject}</Badge>
          <Badge variant="outline">{problem.topic}</Badge>
          <Badge variant="outline">difficulty {problem.difficulty}</Badge>
        </div>
        <CardTitle className="pt-2 text-lg leading-snug">{problem.statement}</CardTitle>
      </CardHeader>
      <CardContent />
      <CardFooter>
        <Button variant="outline" onClick={onNext}>
          Skip
        </Button>
      </CardFooter>
    </Card>
  );
}
