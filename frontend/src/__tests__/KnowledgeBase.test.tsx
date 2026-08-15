import { render, screen, waitFor } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import KnowledgeBase from '@/pages/KnowledgeBase';
import * as client from '@/api/client';
import type { IdeaListItem } from '@/api/client';

// Mock the API client
vi.mock('@/api/client', async () => {
  const actual = await vi.importActual('@/api/client');
  return {
    ...actual,
    fetchIdeas: vi.fn(),
    fetchKnowledgeBase: vi.fn(),
    fetchKBDocument: vi.fn(),
    connectSSE: vi.fn(),
  };
});

describe('KnowledgeBase Page', () => {
  const mockIdeas: IdeaListItem[] = [
    { idea_id: '1', title: 'Idea 1', created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' },
    { idea_id: '2', title: 'Idea 2', created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' }
  ];

  const mockKbData = {
    count: 1,
    documents: [{ path: 'raw/doc1.md', filename: 'doc1.md', source: 'raw', content: 'content' }],
    sources: { raw: 1, processed: 0 }
  };

  const mockSSE = { close: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(client.fetchIdeas).mockResolvedValue(mockIdeas);
    vi.mocked(client.fetchKnowledgeBase).mockResolvedValue(mockKbData);
    vi.mocked(client.connectSSE).mockReturnValue(mockSSE as unknown as EventSource);
  });

  test('renders loading state initially', async () => {
    // We don't resolve the promises immediately to see the loader
    let resolveIdeas: (value: IdeaListItem[] | PromiseLike<IdeaListItem[]>) => void = () => {};
    vi.mocked(client.fetchIdeas).mockReturnValue(new Promise<IdeaListItem[]>(res => { resolveIdeas = res; }));
    
    render(<KnowledgeBase />);
    
    expect(screen.getByTestId('loader')).toBeInTheDocument();
    
    resolveIdeas(mockIdeas);
  });

  test('renders page content after loading', async () => {
    render(<KnowledgeBase />);

    await waitFor(() => {
      expect(screen.getByText('Knowledge Base')).toBeInTheDocument();
    });

    // Use more robust selectors for counts
    // Find Source Documents card and then look for the large bold number inside it
    const sourceDocsCard = screen.getByText('Source Documents').closest('.p-5');
    expect(sourceDocsCard?.querySelector('.tracking-tight')?.textContent).toBe('1');

    const ideasCard = screen.getByText('Ideas Discovered').closest('.p-5');
    expect(ideasCard?.querySelector('.tracking-tight')?.textContent).toBe('2');
  });

  test('fetches data and connects SSE on mount', async () => {
    render(<KnowledgeBase />);

    await waitFor(() => {
      expect(client.fetchIdeas).toHaveBeenCalled();
      expect(client.fetchKnowledgeBase).toHaveBeenCalled();
      expect(client.connectSSE).toHaveBeenCalled();
    });
  });

  test('closes SSE on unmount', async () => {
    const { unmount } = render(<KnowledgeBase />);
    
    await waitFor(() => {
      expect(client.connectSSE).toHaveBeenCalled();
    });

    unmount();
    expect(mockSSE.close).toHaveBeenCalled();
  });

  test('handles fetch errors gracefully', async () => {
    vi.mocked(client.fetchKnowledgeBase).mockRejectedValue(new Error('Fetch failed'));
    
    render(<KnowledgeBase />);

    await waitFor(() => {
      expect(screen.getByText('Knowledge Base')).toBeInTheDocument();
    });
    
    // Should still show 0 documents if fetch failed (initial state)
    const sourceDocsCard = screen.getByText('Source Documents').closest('.p-5');
    expect(sourceDocsCard?.querySelector('.tracking-tight')?.textContent).toBe('0');
  });
});
