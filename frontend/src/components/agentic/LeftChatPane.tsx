import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '../ui/card';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { Send, Plus, Mic, Bot, User, Sparkles, MessageSquare } from 'lucide-react';

interface ChatMessage {
  id: string;
  sender: string;
  role?: string;
  text: string;
  timestamp: string;
}

interface LeftChatPaneProps {
  ideaId: string;
  messages?: ChatMessage[];
  onSendMessage?: (text: string) => Promise<void>;
}

export const LeftChatPane: React.FC<LeftChatPaneProps> = ({
  ideaId,
  messages = [],
  onSendMessage,
}) => {
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [chatList, setChatList] = useState<ChatMessage[]>(messages);

  useEffect(() => {
    if (messages.length > 0) {
      setChatList(messages);
    } else {
      setChatList([
        {
          id: 'm1',
          sender: 'Alex - Lead Engineer',
          role: 'Subagent Specialist',
          text: 'Welcome! Our agentic team is evaluating this patent candidate. How can we help steer your disclosure?',
          timestamp: '12:00',
        },
        {
          id: 'm2',
          sender: 'David - Data Analyst',
          role: 'Prior-Art Researcher',
          text: 'I have compiled prior-art references from the Siemens knowledge base taxonomy for your review.',
          timestamp: '12:01',
        },
      ]);
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    const textToSend = input.trim();
    setInput('');
    setSending(true);

    // Optimistic user message append
    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`,
      sender: 'You',
      role: 'Inventor',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setChatList((prev) => [...prev, userMsg]);

    try {
      if (onSendMessage) {
        await onSendMessage(textToSend);
      } else {
        const res = await fetch(`/api/ideas/${ideaId}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sender: 'Inventor', text: textToSend }),
        });
        if (res.ok) {
          const data = await res.json();
          const botReply: ChatMessage = {
            id: `b_${Date.now()}`,
            sender: data.active_agent || 'Subagent Mesh',
            role: 'Subagent Specialist',
            text: data.agent_reply || 'Feedback incorporated.',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          };
          setChatList((prev) => [...prev, botReply]);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className="flex flex-col h-[700px] border-zinc-800 bg-zinc-950/90 shadow-xl backdrop-blur">
      <CardHeader className="p-4 border-b border-zinc-800/80 bg-zinc-900/40">
        <CardTitle className="text-sm font-semibold flex items-center justify-between text-zinc-100">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-indigo-400" />
            Agentic Workspace Chat
          </div>
          <span className="text-xs text-zinc-400 font-mono">Live Dialogue</span>
        </CardTitle>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
        {chatList.map((msg) => {
          const isUser = msg.sender === 'You' || msg.role === 'Inventor';
          return (
            <div
              key={msg.id}
              className={`flex gap-3 text-xs ${isUser ? 'flex-row-reverse' : ''}`}
            >
              <Avatar className="h-7 w-7 shrink-0">
                <AvatarFallback className={isUser ? 'bg-indigo-600 text-white font-bold text-[10px]' : 'bg-zinc-800 text-zinc-300 font-bold text-[10px]'}>
                  {isUser ? 'YOU' : 'AGENT'}
                </AvatarFallback>
              </Avatar>
              <div className={`space-y-1 max-w-[82%] ${isUser ? 'text-right' : ''}`}>
                <div className="flex items-center gap-2 text-[11px] text-zinc-400">
                  <span className="font-semibold text-zinc-200">{msg.sender}</span>
                  <span>{msg.timestamp}</span>
                </div>
                <div
                  className={`p-3 rounded-2xl text-xs leading-relaxed ${
                    isUser
                      ? 'bg-indigo-600 text-white rounded-tr-none'
                      : 'bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-tl-none'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>

      <CardFooter className="p-3 border-t border-zinc-800/80 bg-zinc-900/40">
        <div className="w-full space-y-2">
          <div className="relative rounded-2xl bg-zinc-900 border border-zinc-800 focus-within:border-indigo-500/60 p-2 transition-all">
            <Textarea
              placeholder="Ask the team to bring your idea to life"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              className="w-full bg-transparent border-0 focus-visible:ring-0 text-xs min-h-[44px] resize-none text-zinc-100 placeholder:text-zinc-500"
            />
            <div className="flex items-center justify-between pt-2 px-1">
              <div className="flex items-center gap-1.5 text-zinc-400">
                <Button variant="ghost" size="icon" className="h-7 w-7 text-zinc-400 hover:text-zinc-200">
                  <Plus className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-zinc-400 hover:text-zinc-200">
                  <Mic className="w-4 h-4" />
                </Button>
              </div>
              <Button
                size="icon"
                disabled={!input.trim() || sending}
                onClick={handleSend}
                className="h-8 w-8 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white shadow-md"
              >
                <Send className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </CardFooter>
    </Card>
  );
};
