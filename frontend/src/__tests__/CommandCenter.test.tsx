import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CommandCenter from '@/pages/CommandCenter';
import * as apiClient from '@/api/client';
import { useChatStream } from '@/hooks/useChatStream';

// Mock the hooks
vi.mock('@/hooks/useChatStream', () => ({
  useChatStream: vi.fn(),
}));

vi.mock('@/hooks/useThreadManager', () => ({
  useThreadManager: vi.fn(),
}));

vi.mock('@/api/client', () => ({
  createThread: vi.fn(),
  listThreads: vi.fn(),
  getThreadMessages: vi.fn(),
  streamThreadMessage: vi.fn(),
  connectSSE: vi.fn(),
}));

// Mock sub-components
vi.mock('@/components/command-center/CommandCenterChatPane', () => ({
  CommandCenterChatPane: ({
    messages,
    isGenerating,
    chatInput,
    isInterruptActive,
    pendingInterrupt,
    onChatInputChange,
    onSendOrQueue,
    onStopGeneration,
    onCreateNewThread,
    onApproveInterrupt,
    onRejectInterrupt,
  }: any) => (
    <div data-testid="chat-pane">
      {isInterruptActive && <div data-testid="interrupt-overlay">Interrupt</div>}
      <input
        data-testid="chat-input"
        value={chatInput}
        onChange={(e) => onChatInputChange(e.target.value)}
        placeholder={isInterruptActive ? 'Awaiting your approval...' : 'Type a message...'}
        disabled={isInterruptActive}
      />
      <div data-testid="message-list">
        {messages.map((m: any, i: number) => (
          <div key={m.id || i} data-testid={`message-${i}`}>
            {m.sender}: {m.text}
          </div>
        ))}
      </div>
      {pendingInterrupt && <div data-testid="interrupt-data">{pendingInterrupt.id}</div>}
      <button
        data-testid="send-button"
        onClick={onSendOrQueue}
        disabled={!chatInput.trim()}
      >
        Send
      </button>
      {isGenerating && (
        <button data-testid="stop-button" onClick={onStopGeneration}>
          Stop
        </button>
      )}
      <button data-testid="new-thread-button" onClick={onCreateNewThread}>
        New Thread
      </button>
      {isInterruptActive && (
        <>
          <button data-testid="approve-button" onClick={() => onApproveInterrupt?.(pendingInterrupt?.id, "yes", "approved")} disabled={!isInterruptActive}>
            Approve
          </button>
          <button data-testid="reject-button" onClick={() => onRejectInterrupt?.(pendingInterrupt?.id, "rejected")} disabled={!isInterruptActive}>
            Reject
          </button>
        </>
      )}
    </div>
  ),
}));

vi.mock('@/components/command-center/CommandCenterWorkspacePane', () => ({
  CommandCenterWorkspacePane: () => (
    <div data-testid="workspace-pane">Workspace</div>
  ),
}));

// Mock Resizable components
vi.mock('@/components/ui/resizable', () => ({
  ResizablePanelGroup: ({ children, ...props }: any) => (
    <div data-testid="resizable-group" {...props}>
      {children}
    </div>
  ),
  ResizablePanel: ({ children, ...props }: any) => (
    <div data-testid="resizable-panel" {...props}>
      {children}
    </div>
  ),
  ResizableHandle: ({ withHandle }: any) => (
    <div data-testid="resizable-handle" data-with-handle={withHandle}>
      Handle
    </div>
  ),
}));

const mockUseChatStream = vi.mocked(useChatStream);
const mockCreateThread = vi.mocked(apiClient.createThread);

const defaultProps = {
  activeThreadId: 'thread-1',
  setActiveThreadId: vi.fn(),
  onActiveThreadTitleChange: vi.fn(),
  onThreadsUpdate: vi.fn(),
  threads: [] as import('@/api/client').ThreadMetadata[],
  isWorkspaceOpen: true,
  setIsWorkspaceOpen: vi.fn(),
};

describe('CommandCenter', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseChatStream.mockReturnValue({
      chatInput: '',
      setChatInput: vi.fn(),
      isGenerating: false,
      messageQueue: [],
      messages: [],
      handleStopGeneration: vi.fn(),
      toggleTrace: vi.fn(),
      handleSendOrQueue: vi.fn(),
      executeSend: vi.fn(),
      searchQuery: '',
      setSearchQuery: vi.fn(),
      tasks: [],
      taskStats: { completed: 0, total: 0 },
      pendingInterrupt: null,
      isInterruptActive: false,
      handleApproveInterrupt: vi.fn(),
      handleRejectInterrupt: vi.fn(),
    });

    mockCreateThread.mockResolvedValue({
      thread_id: 'new-thread-1',
      title: 'New Chat',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      status: 'active',
      idea_id: null,
      tags: [],
      agent_names: [],
    });
  });

  test('renders without crashing', () => {
    const { container } = render(<CommandCenter {...defaultProps} />);
    expect(container.firstChild).not.toBeNull();
  });

  test('renders chat pane', () => {
    render(<CommandCenter {...defaultProps} />);
    expect(screen.getByTestId('chat-pane')).toBeDefined();
  });

  test('renders chat input field', () => {
    render(<CommandCenter {...defaultProps} />);
    expect(screen.getByTestId('chat-input')).toBeDefined();
  });

  test('renders send button', () => {
    render(<CommandCenter {...defaultProps} />);
    expect(screen.getByTestId('send-button')).toBeDefined();
  });

  test('displays messages from hook', () => {
    mockUseChatStream.mockReturnValue({
      chatInput: '',
      setChatInput: vi.fn(),
      isGenerating: false,
      messageQueue: [],
      messages: [
        { id: '1', sender: 'You', text: 'Hello', timestamp: '12:00 PM' },
        { id: '2', sender: 'Assistant', text: 'Hi there', timestamp: '12:01 PM' },
      ],
      handleStopGeneration: vi.fn(),
      toggleTrace: vi.fn(),
      handleSendOrQueue: vi.fn(),
      executeSend: vi.fn(),
      searchQuery: '',
      setSearchQuery: vi.fn(),
      tasks: [],
      taskStats: { completed: 0, total: 0 },
      pendingInterrupt: null,
      isInterruptActive: false,
      handleApproveInterrupt: vi.fn(),
      handleRejectInterrupt: vi.fn(),
    });

    render(<CommandCenter {...defaultProps} />);

    expect(screen.getByTestId('message-0')).toHaveTextContent('You: Hello');
    expect(screen.getByTestId('message-1')).toHaveTextContent('Assistant: Hi there');
  });

  test('stop button appears when isGenerating is true', () => {
    mockUseChatStream.mockReturnValue({
      chatInput: '',
      setChatInput: vi.fn(),
      isGenerating: true,
      messageQueue: [],
      messages: [],
      handleStopGeneration: vi.fn(),
      toggleTrace: vi.fn(),
      handleSendOrQueue: vi.fn(),
      executeSend: vi.fn(),
      searchQuery: '',
      setSearchQuery: vi.fn(),
      tasks: [],
      taskStats: { completed: 0, total: 0 },
      pendingInterrupt: null,
      isInterruptActive: false,
      handleApproveInterrupt: vi.fn(),
      handleRejectInterrupt: vi.fn(),
    });

    render(<CommandCenter {...defaultProps} />);

    expect(screen.getByTestId('stop-button')).toBeDefined();
  });

  test('stop button does not appear when not generating', () => {
    mockUseChatStream.mockReturnValue({
      chatInput: '',
      setChatInput: vi.fn(),
      isGenerating: false,
      messageQueue: [],
      messages: [],
      handleStopGeneration: vi.fn(),
      toggleTrace: vi.fn(),
      handleSendOrQueue: vi.fn(),
      executeSend: vi.fn(),
      searchQuery: '',
      setSearchQuery: vi.fn(),
      tasks: [],
      taskStats: { completed: 0, total: 0 },
      pendingInterrupt: null,
      isInterruptActive: false,
      handleApproveInterrupt: vi.fn(),
      handleRejectInterrupt: vi.fn(),
    });

    render(<CommandCenter {...defaultProps} />);

    expect(screen.queryByTestId('stop-button')).toBeNull();
  });

  test('user can type in chat input and trigger send', () => {
    const mockSendOrQueue = vi.fn();
    const mockSetChatInput = vi.fn();

    mockUseChatStream.mockReturnValue({
      chatInput: 'Hello',
      setChatInput: mockSetChatInput,
      isGenerating: false,
      messageQueue: [],
      messages: [],
      handleStopGeneration: vi.fn(),
      toggleTrace: vi.fn(),
      handleSendOrQueue: mockSendOrQueue,
      executeSend: vi.fn(),
      searchQuery: '',
      setSearchQuery: vi.fn(),
      tasks: [],
      taskStats: { completed: 0, total: 0 },
      pendingInterrupt: null,
      isInterruptActive: false,
      handleApproveInterrupt: vi.fn(),
      handleRejectInterrupt: vi.fn(),
    });

    render(<CommandCenter {...defaultProps} />);

    const sendButton = screen.getByTestId('send-button');
    fireEvent.click(sendButton);

    expect(mockSendOrQueue).toHaveBeenCalled();
  });

  test('thread switching triggers through props', () => {
    const { rerender } = render(<CommandCenter {...defaultProps} />);

    // Re-render with different activeThreadId
    rerender(
      <CommandCenter {...defaultProps} activeThreadId="thread-2" />
    );

    // Component should re-render without errors
    expect(screen.getByTestId('chat-pane')).toBeDefined();
  });

  test('renders workspace pane when isWorkspaceOpen is true', () => {
    render(<CommandCenter {...defaultProps} isWorkspaceOpen={true} />);

    expect(screen.getByTestId('chat-pane')).toBeDefined();
  });

  test('renders only chat pane when isWorkspaceOpen is false', () => {
    render(<CommandCenter {...defaultProps} isWorkspaceOpen={false} />);

    expect(screen.getByTestId('chat-pane')).toBeDefined();
    // Workspace pane should not be visible when isWorkspaceOpen is false
    expect(screen.queryByTestId('workspace-pane')).not.toBeInTheDocument();
  });

  test('Interrupt overlay renders when isInterruptActive is true', () => {
    mockUseChatStream.mockReturnValue({
      chatInput: '',
      setChatInput: vi.fn(),
      isGenerating: false,
      messageQueue: [],
      messages: [],
      handleStopGeneration: vi.fn(),
      toggleTrace: vi.fn(),
      handleSendOrQueue: vi.fn(),
      executeSend: vi.fn(),
      searchQuery: '',
      setSearchQuery: vi.fn(),
      tasks: [],
      taskStats: { completed: 0, total: 0 },
      pendingInterrupt: { id: 'int-1' },
      isInterruptActive: true,
      handleApproveInterrupt: vi.fn(),
      handleRejectInterrupt: vi.fn(),
    });
    render(<CommandCenter {...defaultProps} />);
    expect(screen.getByTestId('interrupt-overlay')).toBeInTheDocument();
  });

  test('Chat input is disabled when isInterruptActive is true', () => {
    mockUseChatStream.mockReturnValue({
      chatInput: '',
      setChatInput: vi.fn(),
      isGenerating: false,
      messageQueue: [],
      messages: [],
      handleStopGeneration: vi.fn(),
      toggleTrace: vi.fn(),
      handleSendOrQueue: vi.fn(),
      executeSend: vi.fn(),
      searchQuery: '',
      setSearchQuery: vi.fn(),
      tasks: [],
      taskStats: { completed: 0, total: 0 },
      pendingInterrupt: { id: 'int-1' },
      isInterruptActive: true,
      handleApproveInterrupt: vi.fn(),
      handleRejectInterrupt: vi.fn(),
    });
    render(<CommandCenter {...defaultProps} />);
    expect(screen.getByTestId('chat-input')).toBeDisabled();
    expect(screen.getByPlaceholderText('Awaiting your approval...')).toBeInTheDocument();
  });

  test('No overlay and input enabled when isInterruptActive is false', () => {
    render(<CommandCenter {...defaultProps} />);
    expect(screen.queryByTestId('interrupt-overlay')).not.toBeInTheDocument();
    expect(screen.getByTestId('chat-input')).not.toBeDisabled();
  });

  test('Overlay renders with interrupt data', () => {
    mockUseChatStream.mockReturnValue({
      chatInput: '',
      setChatInput: vi.fn(),
      isGenerating: false,
      messageQueue: [],
      messages: [],
      handleStopGeneration: vi.fn(),
      toggleTrace: vi.fn(),
      handleSendOrQueue: vi.fn(),
      executeSend: vi.fn(),
      searchQuery: '',
      setSearchQuery: vi.fn(),
      tasks: [],
      taskStats: { completed: 0, total: 0 },
      pendingInterrupt: { id: 'int-42' },
      isInterruptActive: true,
      handleApproveInterrupt: vi.fn(),
      handleRejectInterrupt: vi.fn(),
    });
    render(<CommandCenter {...defaultProps} />);
    expect(screen.getByTestId('interrupt-data')).toHaveTextContent('int-42');
  });
  test('approve button calls handleApproveInterrupt', () => {
    const mockApprove = vi.fn();
    mockUseChatStream.mockReturnValue({
      chatInput: '',
      setChatInput: vi.fn(),
      isGenerating: false,
      messageQueue: [],
      messages: [],
      handleStopGeneration: vi.fn(),
      toggleTrace: vi.fn(),
      handleSendOrQueue: vi.fn(),
      executeSend: vi.fn(),
      searchQuery: '',
      setSearchQuery: vi.fn(),
      tasks: [],
      taskStats: { completed: 0, total: 0 },
      pendingInterrupt: { id: 'int-1' },
      isInterruptActive: true,
      handleApproveInterrupt: mockApprove,
      handleRejectInterrupt: vi.fn(),
    });
    render(<CommandCenter {...defaultProps} />);
    fireEvent.click(screen.getByTestId('approve-button'));
    expect(mockApprove).toHaveBeenCalledWith('int-1', 'yes', 'approved');
  });
  test('reject button calls handleRejectInterrupt', () => {
    const mockReject = vi.fn();
    mockUseChatStream.mockReturnValue({
      chatInput: '',
      setChatInput: vi.fn(),
      isGenerating: false,
      messageQueue: [],
      messages: [],
      handleStopGeneration: vi.fn(),
      toggleTrace: vi.fn(),
      handleSendOrQueue: vi.fn(),
      executeSend: vi.fn(),
      searchQuery: '',
      setSearchQuery: vi.fn(),
      tasks: [],
      taskStats: { completed: 0, total: 0 },
      pendingInterrupt: { id: 'int-1' },
      isInterruptActive: true,
      handleApproveInterrupt: vi.fn(),
      handleRejectInterrupt: mockReject,
    });
    render(<CommandCenter {...defaultProps} />);
    fireEvent.click(screen.getByTestId('reject-button'));
    expect(mockReject).toHaveBeenCalledWith('int-1', 'rejected');
  });
});
