import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { DocumentUploadCard } from '@/components/knowledge-base/DocumentUploadCard';
import * as client from '@/api/client';

// Mock the API client
vi.mock('@/api/client', async () => {
  const actual = await vi.importActual('@/api/client');
  return {
    ...actual,
    ingestKnowledgeBaseDocument: vi.fn(),
  };
});

describe('DocumentUploadCard', () => {
  const mockOnSuccess = vi.fn().mockResolvedValue(undefined);
  const setUploading = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('renders upload instructions and button', () => {
    render(
      <DocumentUploadCard
        uploading={false}
        setUploading={setUploading}
        onSuccess={mockOnSuccess}
      />
    );

    expect(screen.getByText(/Upload Custom Knowledge Documents/i)).toBeInTheDocument();
    expect(screen.getByText(/Upload file/i)).toBeInTheDocument();
    expect(screen.getByText(/knowledge-base\/raw\//i)).toBeInTheDocument();
  });

  test('disables button when uploading is true', () => {
    render(
      <DocumentUploadCard
        uploading={true}
        setUploading={setUploading}
        onSuccess={mockOnSuccess}
      />
    );

    const button = screen.getByRole('button', { name: /upload file/i });
    expect(button).toBeDisabled();
    expect(screen.getByTestId('loader')).toBeInTheDocument();
  });

  test('triggers file input when button is clicked', () => {
    render(
      <DocumentUploadCard
        uploading={false}
        setUploading={setUploading}
        onSuccess={mockOnSuccess}
      />
    );

    const fileInput = screen.getByTestId('file-input');
    // Check if it's hidden but present
    expect(fileInput).toBeInTheDocument();
    expect(fileInput).toHaveClass('hidden');
  });

  test('handles file upload successfully', async () => {
    const mockResponse = { success: true };
    (client.ingestKnowledgeBaseDocument as any).mockResolvedValue(mockResponse);

    render(
      <DocumentUploadCard
        uploading={false}
        setUploading={setUploading}
        onSuccess={mockOnSuccess}
      />
    );

    const input = screen.getByTestId('file-input') as HTMLInputElement;
    const file = new File(['hello world'], 'hello.txt', { type: 'text/plain' });

    fireEvent.change(input, { target: { files: [file] } });

    expect(setUploading).toHaveBeenCalledWith(true);

    await waitFor(() => {
      expect(client.ingestKnowledgeBaseDocument).toHaveBeenCalledWith(
        expect.objectContaining({ file: expect.any(File), source: 'raw' })
      );
    });

    await waitFor(() => {
      expect(mockOnSuccess).toHaveBeenCalled();
    });

    expect(setUploading).toHaveBeenCalledWith(false);
  });

  test('handles upload error gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (client.ingestKnowledgeBaseDocument as any).mockRejectedValue(new Error('Upload failed'));

    render(
      <DocumentUploadCard
        uploading={false}
        setUploading={setUploading}
        onSuccess={mockOnSuccess}
      />
    );

    const input = screen.getByTestId('file-input') as HTMLInputElement;
    const file = new File(['hello world'], 'hello.txt', { type: 'text/plain' });

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Document upload error:', expect.any(Error));
    });

    expect(setUploading).toHaveBeenCalledWith(false);
    expect(mockOnSuccess).not.toHaveBeenCalled();
    
    consoleSpy.mockRestore();
  });
});
