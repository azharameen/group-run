import { useState, useEffect } from "react";
import { Server, Plus, Trash2, Loader2, Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  fetchMCPServers,
  addMCPServer,
  removeMCPServer,
  type MCPServer,
} from "@/api/mcp";

export function MCPManager() {
  const { toast } = useToast();
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add form state
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [timeout, setTimeout_] = useState(10);
  const [adding, setAdding] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadServers = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchMCPServers();
      setServers(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load MCP servers";
      setError(message);
      toast({ variant: "destructive", title: "Load failed", description: message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadServers();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!name.trim() || !url.trim()) {
      setFormError("Name and URL are required.");
      return;
    }

    setAdding(true);
    try {
      const addedName = name.trim();
      await addMCPServer(addedName, url.trim(), timeout);
      await loadServers();
      setName("");
      setUrl("");
      setTimeout_(10);
      toast({ title: "Server added", description: `"${addedName}" has been added.` });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to add server";
      setFormError(message);
      toast({ variant: "destructive", title: "Add failed", description: message });
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await removeMCPServer(deleteTarget);
      toast({ title: "Server removed", description: `"${deleteTarget}" has been removed.` });
      await loadServers();
      setDeleteTarget(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to remove server";
      toast({ variant: "destructive", title: "Remove failed", description: message });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Server className="h-5 w-5" />
          MCP Servers
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Manage MCP (Model Context Protocol) server connections.
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Server list */}
      <div>
        <h3 className="text-sm font-medium mb-2">Configured Servers</h3>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Loading servers...</span>
          </div>
        ) : servers.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center">
            <p className="text-sm text-muted-foreground">
              No MCP servers configured. Add one below.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>URL</TableHead>
                <TableHead>Timeout</TableHead>
                <TableHead>Transport</TableHead>
                <TableHead className="w-[80px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {servers.map((server) => (
                <TableRow key={server.name}>
                  <TableCell className="font-medium">{server.name}</TableCell>
                  <TableCell className="max-w-[300px] truncate" title={server.url}>
                    {server.url}
                  </TableCell>
                  <TableCell>{server.timeout}s</TableCell>
                  <TableCell>
                    <Badge variant="outline">{server.transport}</Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteTarget(server.name)}
                      disabled={deleting}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Add server form */}
      <div>
        <h3 className="text-sm font-medium mb-2">Add Server</h3>
        <form onSubmit={handleAdd} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Name</label>
              <Input
                placeholder="my-server"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={64}
                disabled={adding}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">URL</label>
              <Input
                placeholder="http://localhost:8080/mcp"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={adding}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Timeout (s)</label>
              <Input
                type="number"
                min={1}
                max={300}
                value={timeout}
                onChange={(e) => {
                  const v = e.target.value === '' ? 0 : Number(e.target.value);
                  if (!Number.isNaN(v)) setTimeout_(v);
                }}
                disabled={adding}
              />
            </div>
          </div>
          {formError && (
            <p className="text-sm text-destructive">{formError}</p>
          )}
          <Button type="submit" disabled={adding}>
            {adding ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Adding...
              </>
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" />
                Add Server
              </>
            )}
          </Button>
        </form>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove MCP Server?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove <strong>{deleteTarget}</strong> from the configuration. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
