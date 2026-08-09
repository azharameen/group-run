import { useState, useEffect } from "react";
import { Users, RefreshCw, Loader2, ShieldCheck, User, ChevronRight, ChevronDown, Info } from "lucide-react";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { fetchTeamsConfig, reloadTeamsConfig, type TeamConfigResponse } from "@/api/config";

export function TeamConfig() {
  const { toast } = useToast();
  const [config, setConfig] = useState<TeamConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedTeams, setExpandedTeams] = useState<Record<string, boolean>>({});

  const loadConfig = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTeamsConfig();
      setConfig(data);
      
      // Auto-expand all teams by default for visibility
      const expanded: Record<string, boolean> = {};
      Object.keys(data.teams).forEach(id => {
        expanded[id] = true;
      });
      setExpandedTeams(expanded);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load team configuration";
      setError(message);
      toast({ variant: "destructive", title: "Load failed", description: message });
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
      toast({ title: "Configuration reloaded", description: result.message });
      await loadConfig();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to reload configuration";
      toast({ variant: "destructive", title: "Reload failed", description: message });
    } finally {
      setReloading(false);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedTeams((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  if (loading && !config) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-3 text-lg text-muted-foreground">Loading configuration...</span>
      </div>
    );
  }

  const teamsEntries = config ? Object.entries(config.teams) : [];

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
        <Button onClick={handleReload} disabled={reloading || loading} variant="outline" size="sm">
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
            <span>{teamsEntries.length} Teams Loaded</span>
          </div>

          {teamsEntries.length === 0 ? (
            <div className="rounded-md border border-dashed p-12 text-center">
              <Users className="h-8 w-8 mx-auto opacity-20 mb-3" />
              <p className="text-muted-foreground">No teams defined in teams.yaml.</p>
            </div>
          ) : (
            teamsEntries.map(([id, team]) => (
              <Card key={id} className="overflow-hidden">
                <CardHeader className="bg-muted/30 pb-3 cursor-pointer hover:bg-muted/40 transition-colors" onClick={() => toggleExpand(id)}>
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-base flex items-center gap-2">
                        {expandedTeams[id] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        <ShieldCheck className="h-4 w-4 text-primary" />
                        {team.name}
                        <Badge variant="secondary" className="text-[10px] ml-2 font-mono">
                          {id}
                        </Badge>
                      </CardTitle>
                      <CardDescription className="text-xs ml-6">{team.description}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                {expandedTeams[id] && (
                  <CardContent className="pt-4 border-t">
                    <div className="space-y-6">
                      <div>
                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
                          <User className="h-3 w-3" />
                          Agents
                        </h4>
                        <div className="rounded-md border overflow-hidden">
                          <Table>
                            <TableHeader className="bg-muted/50">
                              <TableRow className="hover:bg-transparent">
                                <TableHead className="h-8 text-[11px]">Name</TableHead>
                                <TableHead className="h-8 text-[11px]">Role</TableHead>
                                <TableHead className="h-8 text-[11px]">Description</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {team.agents.map((agent, idx) => (
                                <TableRow key={idx}>
                                  <TableCell className="py-2 text-sm font-medium">
                                    {agent.name}
                                  </TableCell>
                                  <TableCell className="py-2 text-sm text-muted-foreground">{agent.role}</TableCell>
                                  <TableCell className="py-2 text-sm text-muted-foreground italic">
                                    {agent.description || "-"}
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
                        </div>
                      </div>

                      <div>
                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
                          Routing Keys
                        </h4>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {team.routing_keys.map((key) => (
                            <Badge key={key} variant="outline" className="font-mono text-[10px] bg-background">
                              {key}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
