import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Search, Folder, FileText, ChevronRight, ChevronDown, Download, Share2 } from 'lucide-react';
import { IdeaFile } from '../../api/client';

interface FileTreeEditorProps {
  files?: IdeaFile[];
  ideaId?: string;
}

export const FileTreeEditor: React.FC<FileTreeEditorProps> = ({ files = [], ideaId = '' }) => {
  const [selectedFile, setSelectedFile] = useState<string>('file_tree.md');
  const [searchTerm, setSearchTerm] = useState('');

  const sampleFiles = [
    { name: 'file_tree.md', category: 'docs', content: `# File Tree: Agentic Organization Web Prototype\n\nagentic-org/\n├── docker-compose.yml       # PostgreSQL, Redis, Backend, Frontend\n├── .env.example             # Environment variables template\n├── README.md                # Project overview and setup guide\n\nbackend/\n├── Dockerfile\n├── pyproject.toml           # Python dependencies (FastAPI, SQLModel, etc.)\n├── alembic.ini              # Database migrations config\n` },
    { name: 'architect.plantuml', category: 'docs', content: `@startuml\nactor User\nnode "FastAPI Agent Backend"\nnode "React Frontend UI"\n@enduml` },
    { name: 'system_design.md', category: 'docs', content: `# System Design & Multi-Agent Architecture\n\n- Discovery Subagent\n- Drafting Subagent\n- Review Subagent\n- Siemens Strategy Subagent\n` },
  ];

  const activeDoc = sampleFiles.find((f) => f.name === selectedFile) || sampleFiles[0];

  return (
    <Card className="border-zinc-800 bg-zinc-950/90 shadow-xl backdrop-blur flex flex-col md:flex-row min-h-[600px] overflow-hidden">
      {/* Left Sidebar File Tree */}
      <div className="w-full md:w-64 border-r border-zinc-800/80 bg-zinc-900/40 p-3 space-y-3 shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-400" />
          <Input
            placeholder="Search files..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 h-8 bg-zinc-900 border-zinc-800 text-xs text-zinc-200"
          />
        </div>

        <div className="space-y-1 text-xs">
          <div className="flex items-center gap-1.5 text-zinc-400 font-semibold py-1">
            <ChevronDown className="w-3.5 h-3.5" />
            <Folder className="w-3.5 h-3.5 text-indigo-400" />
            <span>docs</span>
          </div>

          <div className="pl-4 space-y-1">
            {sampleFiles.map((file) => (
              <div
                key={file.name}
                onClick={() => setSelectedFile(file.name)}
                className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${
                  selectedFile === file.name
                    ? 'bg-indigo-600/30 text-indigo-200 font-medium border border-indigo-500/40'
                    : 'text-zinc-300 hover:bg-zinc-800/60'
                }`}
              >
                <FileText className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                <span className="truncate">{file.name}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="pt-4 border-t border-zinc-800">
          <Button variant="outline" size="sm" className="w-full h-8 text-xs border-zinc-700 bg-zinc-900 text-zinc-200">
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Download Project
          </Button>
        </div>
      </div>

      {/* Right Code/Markdown Editor View */}
      <div className="flex-1 flex flex-col bg-zinc-950">
        <div className="flex items-center justify-between p-3 border-b border-zinc-800/80 bg-zinc-900/40">
          <div className="flex items-center gap-2 text-xs font-mono text-indigo-300">
            <FileText className="w-4 h-4 text-indigo-400" />
            <span>{activeDoc.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-7 text-xs text-zinc-400 hover:text-zinc-200">
              <Share2 className="w-3.5 h-3.5 mr-1" />
              Share
            </Button>
            <Button size="sm" className="h-7 text-xs bg-indigo-600 hover:bg-indigo-500 text-white">
              <Download className="w-3.5 h-3.5 mr-1" />
              Download
            </Button>
          </div>
        </div>

        <div className="p-4 flex-1 overflow-y-auto font-mono text-xs text-zinc-200 leading-relaxed bg-zinc-950">
          <pre className="whitespace-pre-wrap">{activeDoc.content}</pre>
        </div>
      </div>
    </Card>
  );
};
