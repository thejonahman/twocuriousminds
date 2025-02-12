import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Message } from '@/lib/api-types';

interface PollingState {
  polling: boolean;
  error: string | null;
}

const POLLING_INTERVAL = 2000; // Poll every 2 seconds

export function usePolling(groupId?: number) {
  const { user } = useAuth();
  const { toast } = useToast();
  const messageHandlers = useRef<Set<(messages: Message[]) => void>>(new Set());
  const lastMessageTimestamp = useRef<Date | null>(null);
  const [state, setState] = useState<PollingState>({
    polling: false,
    error: null
  });

  // Simple interval-based polling
  useEffect(() => {
    if (!user || !groupId) return;

    setState({ polling: true, error: null });
    let intervalId: NodeJS.Timeout;

    const pollMessages = async () => {
      try {
        const response = await fetch(`/api/messages?groupId=${groupId}`);

        if (!response.ok) {
          throw new Error('Failed to fetch messages');
        }

        const messages = await response.json();

        // Update handlers with new messages
        if (messages.length > 0) {
          messageHandlers.current.forEach(handler => handler(messages));
          lastMessageTimestamp.current = new Date(messages[messages.length - 1].createdAt);
        }
      } catch (error: any) {
        console.error('Polling error:', error);
        setState(prev => ({ ...prev, error: error.message }));
        toast({
          title: 'Error',
          description: 'Failed to receive messages. Retrying...',
          variant: 'destructive'
        });
      }
    };

    // Start polling
    intervalId = setInterval(pollMessages, POLLING_INTERVAL);

    // Initial poll
    pollMessages();

    return () => {
      clearInterval(intervalId);
      setState({ polling: false, error: null });
    };
  }, [user, groupId, toast]);

  const sendMessage = useCallback(async (content: string): Promise<boolean> => {
    if (!user) {
      toast({
        title: 'Error',
        description: 'You must be logged in to send messages',
        variant: 'destructive'
      });
      return false;
    }

    if (!groupId) {
      toast({
        title: 'Error',
        description: 'Cannot send message - not connected to a group',
        variant: 'destructive'
      });
      return false;
    }

    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          groupId,
          content
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to send message');
      }

      // Get the newly created message and update handlers immediately
      const newMessage = await response.json();
      messageHandlers.current.forEach(handler => handler([newMessage]));

      return true;
    } catch (error) {
      console.error('Send message error:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to send message',
        variant: 'destructive'
      });
      return false;
    }
  }, [user, groupId, toast]);

  const addMessageHandler = useCallback((handler: (messages: Message[]) => void) => {
    messageHandlers.current.add(handler);
    return () => {
      messageHandlers.current.delete(handler);
    };
  }, []);

  return {
    state,
    sendMessage,
    addMessageHandler
  };
}