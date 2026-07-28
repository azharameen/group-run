import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Folder, FileText, Upload } from 'lucide-react';
import { IdeaFile } from '../../api/client';

interface CustomFileItem {
  filename: string;
  type?: string;
  size_bytes: number;
  modified_at?: string;
}

interface FileTableViewProps {
  files?: IdeaFile[];
  ideaId?: string;
}

export const FileTableView: React.FC<FileTableViewProps> = ({ files = [], ideaId = '' }) => {
  const defaultFiles: CustomFileItem[] = files.length > 0 ? files : [
    { filename: 'workspace', type: 'directory', size_bytes: 0, modified_at: '2026/07/28 17:40:29' },
    { filename: '.last_project_mode.json', type: 'file', size_bytes: 30, modified_at: '2026/07/28 17:39:25' },
    { filename: 'ideascope-draft.md', type: 'file', size_bytes: 1250, modified_at: '2026/07/28 17:40:00' },
    { filename: 'prior_art.md', type: 'file', size_bytes: 840, modified_at: '2026/07/28 17:40:15' },
  ];

  return (
    <Card className="border-zinc-800 bg-zinc-950/80 shadow-lg backdrop-blur">
      <CardHeader className="p-4 border-b border-zinc-800/80 flex flex-row items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
          <Folder className="w-4 h-4 text-indigo-400" />
          <span>data / chats / Agentic Organization</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs border-zinc-700 bg-zinc-900 text-zinc-200">
            <Upload className="w-3.5 h-3.5 mr-1.5" />
            Upload file
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs border-zinc-700 bg-zinc-900 text-zinc-200">
            <Folder className="w-3.5 h-3.5 mr-1.5" />
            Upload folder
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="w-full overflow-x-auto">
          <table className="w-full text-xs text-left text-zinc-300">
            <thead className="bg-zinc-900/60 text-zinc-400 border-b border-zinc-800 font-medium">
              <tr>
                <th className="py-3 px-4">File Name</th>
                <th className="py-3 px-4 text-right">Size</th>
                <th className="py-3 px-4 text-right">Last Update</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {defaultFiles.map((file, idx) => (
                <tr key={idx} className="hover:bg-zinc-900/40 transition-colors">
                  <td className="py-3 px-4 flex items-center gap-2 font-mono text-zinc-200">
                    {file.type === 'directory' ? (
                      <Folder className="w-4 h-4 text-amber-400 shrink-0" />
                    ) : (
                      <FileText className="w-4 h-4 text-indigo-400 shrink-0" />
                    )}
                    <span>{file.filename}</span>
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-zinc-400">
                    {file.type === 'directory' ? '-' : `${((file.size_bytes || 0) / 1024).toFixed(2)} KB`}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-zinc-400">
                    {file.modified_at || '2026/07/28 17:40:29'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between p-3 border-t border-zinc-800 text-xs text-zinc-400">
          <span>Rows per page: 10</span>
          <span>{defaultFiles.length} items found</span>
        </div>
      </CardContent>
    </Card>
  );
};
