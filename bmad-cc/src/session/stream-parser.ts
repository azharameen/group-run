export interface SubagentQueryInfo {
  rawPrompt: string;
  isConfirmation: boolean;
  defaultResponse: string;
  options?: string[];
}

export class StreamQueryParser {
  private buffer: string = '';

  private static readonly ANSI_REGEX = /\u001b\[[0-9;?]*[a-zA-Z]/g;

  private static readonly PROMPT_PATTERNS = [
    /\[y\/n\]/i,
    /\[y\/N\]/,
    /\[Y\/n\]/,
    /\(y\/n\)/i,
    /continue\?/i,
    /proceed\?/i,
    /confirm\?/i,
    /overwrite\?/i,
    /are you sure\?/i,
    /\bdo you want to proceed\?/i,
    /\bdo you want to continue\?/i
  ];

  private sanitizeForMatching(text: string): string {
    const noMultiLine = text.replace(/\/\*[\s\S]*?\*\//g, m => ' '.repeat(m.length));

    const lines = noMultiLine.split('\n');
    const sanitizedLines = lines.map(line => {
      const commentIdx = line.indexOf('//');
      const codePart = commentIdx !== -1 ? line.slice(0, commentIdx) + ' '.repeat(line.length - commentIdx) : line;

      if (
        /^\s*(const|let|var|val|final|static|public|private|protected|type|interface|class|function|export|import|return)\b/.test(line) ||
        /\b[a-zA-Z_$][a-zA-Z0-9_$]*\s*[:=]\s*["'`]/.test(line) ||
        /["'`].*?["'`]/.test(codePart)
      ) {
        return ' '.repeat(line.length);
      }
      return codePart;
    });

    return sanitizedLines.join('\n');
  }

  public parseChunk(chunk: string): SubagentQueryInfo | null {
    this.buffer = (this.buffer + chunk).replace(StreamQueryParser.ANSI_REGEX, '');
    if (this.buffer.length > 4096) {
      this.buffer = this.buffer.slice(-2048);
    }

    const sanitized = this.sanitizeForMatching(this.buffer);

    let earliestMatch: { index: number; length: number } | null = null;

    for (const pattern of StreamQueryParser.PROMPT_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      const match = regex.exec(sanitized);
      if (match) {
        if (!earliestMatch || match.index < earliestMatch.index) {
          earliestMatch = {
            index: match.index,
            length: match[0].length
          };
        }
      }
    }

    if (earliestMatch) {
      let endIndex = earliestMatch.index + earliestMatch.length;
      const lineEnd = this.buffer.indexOf('\n', endIndex);
      const searchUntil = lineEnd !== -1 ? lineEnd : this.buffer.length;
      const lineRest = this.buffer.slice(endIndex, searchUntil);
      const bracketMatch = /\[[yY]\/[nN]\]|\([yY]\/[nN]\)/.exec(lineRest);
      if (bracketMatch) {
        endIndex = endIndex + bracketMatch.index + bracketMatch[0].length;
      }

      const matchedText = this.buffer.slice(0, endIndex).trim();
      this.buffer = this.buffer.slice(endIndex);
      return {
        rawPrompt: matchedText,
        isConfirmation: true,
        defaultResponse: 'y'
      };
    }

    return null;
  }

  public reset(): void {
    this.buffer = '';
  }
}

export function detectSubagentQuery(text: string): SubagentQueryInfo | null {
  const parser = new StreamQueryParser();
  return parser.parseChunk(text);
}
