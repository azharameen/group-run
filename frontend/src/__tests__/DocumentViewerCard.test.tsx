import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';
import { DocumentViewerCard } from '@/components/knowledge-base/DocumentViewerCard';
import type { KnowledgeBaseData } from '@/api/client';

describe('DocumentViewerCard', () => {
  const mockKbData: KnowledgeBaseData = {
    count: 2,
    documents: [
      {
        path: 'raw/test1.md',
        filename: 'test1.md',
        source: 'raw',
        content: 'Hello World Content'
      },
      {
        path: 'processed/test2.json',
        filename: 'test2.json',
        source: 'processed',
        content: { key: 'value', summary: 'A json doc' }
      }
    ],
    sources: { raw: 1, processed: 1 }
  };

  const toggleCategory = vi.fn();
  const toggleDocExpand = vi.fn();
  const setExpandedDoc = vi.fn();
  const onViewContent = vi.fn().mockResolvedValue(undefined);

  test('renders documents when kbData is provided', () => {
    render(
      <DocumentViewerCard
        kbData={mockKbData}
        expandedCategories={new Set(['knowledge'])}
        toggleCategory={toggleCategory}
        expandedDocs={new Set()}
        toggleDocExpand={toggleDocExpand}
        expandedDoc={null}
        setExpandedDoc={setExpandedDoc}
        onViewContent={onViewContent}
      />
    );

    expect(screen.getByText(/Local Knowledge Documents/i)).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // Badge count
    expect(screen.getByText('raw/test1.md')).toBeInTheDocument();
    expect(screen.getByText('processed/test2.json')).toBeInTheDocument();
  });

  test('toggles category when clicked', async () => {
    render(
      <DocumentViewerCard
        kbData={mockKbData}
        expandedCategories={new Set()}
        toggleCategory={toggleCategory}
        expandedDocs={new Set()}
        toggleDocExpand={toggleDocExpand}
        expandedDoc={null}
        setExpandedDoc={setExpandedDoc}
        onViewContent={onViewContent}
      />
    );

    const button = screen.getByText(/Local Knowledge Documents/i).closest('button')!;
    fireEvent.click(button);
    expect(toggleCategory).toHaveBeenCalledWith('knowledge');
  });

  test('expands document content when path clicked', async () => {
    render(
      <DocumentViewerCard
        kbData={mockKbData}
        expandedCategories={new Set(['knowledge'])}
        toggleCategory={toggleCategory}
        expandedDocs={new Set()}
        toggleDocExpand={toggleDocExpand}
        expandedDoc={null}
        setExpandedDoc={setExpandedDoc}
        onViewContent={onViewContent}
      />
    );

    const docButton = screen.getByText('raw/test1.md').closest('[role="button"]')!;
    fireEvent.click(docButton);
    expect(toggleDocExpand).toHaveBeenCalledWith('raw/test1.md');
  });

  test('displays expanded content when path is in expandedDocs', () => {
    render(
      <DocumentViewerCard
        kbData={mockKbData}
        expandedCategories={new Set(['knowledge'])}
        toggleCategory={toggleCategory}
        expandedDocs={new Set(['raw/test1.md'])}
        toggleDocExpand={toggleDocExpand}
        expandedDoc={null}
        setExpandedDoc={setExpandedDoc}
        onViewContent={onViewContent}
      />
    );

    expect(screen.getByText('Hello World Content')).toBeInTheDocument();
  });

  test('calls onViewContent when View Content is clicked', async () => {
    render(
      <DocumentViewerCard
        kbData={mockKbData}
        expandedCategories={new Set(['knowledge'])}
        toggleCategory={toggleCategory}
        expandedDocs={new Set()}
        toggleDocExpand={toggleDocExpand}
        expandedDoc={null}
        setExpandedDoc={setExpandedDoc}
        onViewContent={onViewContent}
      />
    );

    const viewButton = screen.getAllByText(/View Content/i)[0];
    fireEvent.click(viewButton);
    
    await waitFor(() => {
      expect(onViewContent).toHaveBeenCalled();
    });
    
    expect(onViewContent).toHaveBeenCalledWith(mockKbData.documents[0]);
  });

  test('renders JSON content stringified', () => {
    render(
      <DocumentViewerCard
        kbData={mockKbData}
        expandedCategories={new Set(['knowledge'])}
        toggleCategory={toggleCategory}
        expandedDocs={new Set(['processed/test2.json'])}
        toggleDocExpand={toggleDocExpand}
        expandedDoc={null}
        setExpandedDoc={setExpandedDoc}
        onViewContent={onViewContent}
      />
    );

    expect(screen.getByText(/"key": "value"/i)).toBeInTheDocument();
  });

  test('renders external sources section', () => {
    render(
      <DocumentViewerCard
        kbData={null}
        expandedCategories={new Set()}
        toggleCategory={toggleCategory}
        expandedDocs={new Set()}
        toggleDocExpand={toggleDocExpand}
        expandedDoc={null}
        setExpandedDoc={setExpandedDoc}
        onViewContent={onViewContent}
      />
    );

    expect(screen.getByText(/External Patent & Knowledge Sources/i)).toBeInTheDocument();
    expect(screen.getByText('Google Patents')).toBeInTheDocument();
  });
});
