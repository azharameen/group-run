import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileDiff, GitCompare } from 'lucide-react';

interface ArtifactDiffPanelProps {
  versionA?: string;
  versionB?: string;
  contentA?: string;
  contentB?: string;
}

export const ArtifactDiffPanel: React.FC<ArtifactDiffPanelProps> = ({
  versionA,
  versionB,
  contentA,
  contentB
}) => {
  if (!versionA || !versionB || !contentA || !contentB) {
    return (
      <Card className="w-full">
        <CardHeader className="pb-3 p-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <FileDiff className="w-4 h-4 text-primary" />
              Artifact Revision Comparison
            </CardTitle>
            <Badge variant="outline" className="text-xs">
              Diff Viewer
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-0 text-xs text-muted-foreground">
          No artifact revisions are available yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-3 p-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <FileDiff className="w-4 h-4 text-primary" />
            Artifact Revision Comparison
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            Diff Viewer
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-xs">
          <div className="p-3 rounded-md border bg-muted/20">
            <div className="font-semibold text-destructive mb-2 pb-1 border-b text-xs">
              {versionA}
            </div>
            <pre className="whitespace-pre-wrap text-muted-foreground leading-relaxed text-[11px]">
              {contentA}
            </pre>
          </div>

          <div className="p-3 rounded-md border bg-muted/20">
            <div className="font-semibold text-emerald-600 dark:text-emerald-400 mb-2 pb-1 border-b text-xs">
              {versionB}
            </div>
            <pre className="whitespace-pre-wrap text-foreground leading-relaxed text-[11px]">
              {contentB}
            </pre>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
