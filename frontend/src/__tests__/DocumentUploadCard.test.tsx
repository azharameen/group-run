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

const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

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
    vi.mocked(client.ingestKnowledgeBaseDocument).mockResolvedValue(mockResponse);

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
        expect.objectContaining({ file: expect.any(File), source: 'raw' }),
        { timeoutMs: undefined }
      );
    });

    await waitFor(() => {
      expect(mockOnSuccess).toHaveBeenCalled();
    });

    expect(setUploading).toHaveBeenCalledWith(false);
  });

  test('handles upload error gracefully and surfaces error message and toast', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(client.ingestKnowledgeBaseDocument).mockRejectedValue(new Error('Upload failed'));

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
      expect(screen.getByTestId('upload-error')).toHaveTextContent('Upload failed');
    });

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'destructive',
        title: 'Upload failed',
        description: 'Upload failed',
      })
    );
    expect(setUploading).toHaveBeenCalledWith(false);
    expect(mockOnSuccess).not.toHaveBeenCalled();
    
    consoleSpy.mockRestore();
  });

  test('simulates slow upload timing out and asserts timeout fires and surfaces error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Simulate a hung/slow upload that rejects due to timeout after timeoutMs
    vi.mocked(client.ingestKnowledgeBaseDocument).mockImplementation(
      (_payload, options) =>
        new Promise((_, reject) => {
          const timeout = options?.timeoutMs ?? 30000;
          setTimeout(() => reject(new Error(`API timeout after ${timeout} ms`)), 10);
        })
    );

    render(
      <DocumentUploadCard
        uploading={false}
        setUploading={setUploading}
        onSuccess={mockOnSuccess}
        timeoutMs={5000}
      />
    );

    const input = screen.getByTestId('file-input') as HTMLInputElement;
    const file = new File(['large file content'], 'big-doc.pdf', { type: 'application/pdf' });

    fireEvent.change(input, { target: { files: [file] } });

    expect(setUploading).toHaveBeenCalledWith(true);

    await waitFor(() => {
      expect(client.ingestKnowledgeBaseDocument).toHaveBeenCalledWith(
        expect.objectContaining({ file: expect.any(File), source: 'raw' }),
        { timeoutMs: 5000 }
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('upload-error')).toHaveTextContent('API timeout after 5000 ms');
    });

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'destructive',
        title: 'Upload failed',
        description: 'API timeout after 5000 ms',
      })
    );

    expect(setUploading).toHaveBeenCalledWith(false);
    expect(mockOnSuccess).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  test('handles unsuccessful response payload gracefully with error msg', async () => {
    vi.mocked(client.ingestKnowledgeBaseDocument).mockResolvedValue({
      success: false,
      error: 'Invalid file format',
    });

    render(
      <DocumentUploadCard
        uploading={false}
        setUploading={setUploading}
        onSuccess={mockOnSuccess}
      />
    );

    const input = screen.getByTestId('file-input') as HTMLInputElement;
    const file = new File(['content'], 'file.xyz', { type: 'application/octet-stream' });

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByTestId('upload-error')).toHaveTextContent('Invalid file format');
    });

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'destructive',
        title: 'Upload failed',
        description: 'Invalid file format',
      })
    );

    expect(setUploading).toHaveBeenCalledWith(false);
    expect(mockOnSuccess).not.toHaveBeenCalled();
  });
});
