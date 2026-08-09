import { useState, useEffect } from "react";
import { Users, RefreshCw, Loader2, Info, ChevronRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  fetchTeamsConfig,
  reloadTeamsConfig,
  type TeamConfigResponse,
  type TeamDefinition,
} from "@/api/config";

export function TeamConfig() {
  const { toast } = useToast();
  const [config, setConfig] = useState<TeamConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());

  const loadConfig = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchTeamsConfig();
      setConfig(result);
      // Auto-expand first team if available
      const firstTeam = Object.keys(result.teams)[0];
      if (firstTeam) {
        setExpandedTeams(new Set([firstTeam]));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load team configuration";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const handleReload = async () => {
    setReloading(true);
    try {
      const result = await reloadTeamsConfig();
      toast({
        title: "Config Reloaded",
        description: `${result.message} (${result.count} teams loaded).`,
      });
      await loadConfig();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to reload configuration";
      toast({
        variant: "destructive",
        title: "Reload Failed",
        description: message,
      });
    } finally {
      setReloading(false);
    }
  };

  const toggleTeam = (key: string) => {
    const newSet = new Set(expandedTeams);
    if (newSet.has(key)) {
      newSet.delete(key);
    } else {
      newSet.add(key);
    }
    setExpandedTeams(newSet);
  };

  if (loading && !config) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-3 text-sm text-muted-foreground">Loading configuration...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Users className="h-5 w-5" />
            Team Configuration
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            View teams, agents, and routing keys defined in <code>teams.yaml</code>.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleReload}
          disabled={reloading || loading}
        >
          {reloading ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Reload Config
        </Button>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive flex gap-3">
          <Info className="h-5 w-5 shrink-0" />
          <div>
            <p className="font-medium">Configuration Error</p>
            <p className="mt-1">{error}</p>
          </div>
        </div>
      )}

      {config && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
            <span>Schema Version: {config.schema_version}</span>
            <span>{Object.keys(config.teams).length} Teams Loaded</span>
          </div>

          {Object.entries(config.teams).map(([key, team]) => (
            <Card key={key} className="overflow-hidden">
              <CardHeader 
                className="py-3 px-4 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => toggleTeam(key)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {expandedTeams.has(key) ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                    <CardTitle className="text-base">{team.name}</CardTitle>
                    <Badge variant="secondary" className="ml-2 font-mono text-[10px]">
                      {key}
                    </Badge>
                  </div>
                </div>
                <CardDescription className="pl-6">
                  {team.description}
                </CardDescription>
              </CardHeader>
              
              {expandedTeams.has(key) && (
                <CardContent className="p-0 border-t">
                  <Table>
                    <TableHeader className="bg-muted/10">
                      <TableRow>
                        <TableHead className="pl-10">Agent</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Routing Keys</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {team.agents.map((agent) => (
                        <TableRow key={agent.name}>
                          <TableCell className="pl-10 font-medium">
                            {agent.name}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {agent.role}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {team.routing_keys
                                .filter(rk => rk.includes(agent.name.toLowerCase().replace(/\s+/g, '')))
                                .map(rk => (
                                  <Badge key={rk} variant="outline" className="text-[10px] font-mono">
                                    {rk}
                                  </Badge>
                                ))}
                              {/* Fallback if no routing keys match agent name pattern */}
                              {team.routing_keys
                                .filter(rk => !rk.includes(agent.name.toLowerCase().replace(/\s+/g, '')))
                                .length > 0 && team.agents.length === 1 && (
                                  team.routing_keys.map(rk => (
                                    <Badge key={rk} variant="outline" className="text-[10px] font-mono">
                                      {rk}
                                    </Badge>
                                  ))
                                )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {team.agents.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center py-4 text-sm text-muted-foreground">
                            No agents configured for this team.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                  
                  {/* All routing keys summary if not agent-scoped above */}
                  <div className="p-3 bg-muted/5 border-t text-[10px] flex gap-2 items-center">
                    <span className="font-semibold uppercase tracking-wider text-muted-foreground">All Team Routing Keys:</span>
                    <div className="flex flex-wrap gap-1">
                      {team.routing_keys.map(rk => (
                        <span key={rk} className="px-1.5 py-0.5 rounded border bg-background font-mono">
                          {rk}
                        </span>
                      ))}
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
