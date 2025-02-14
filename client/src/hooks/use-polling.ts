import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Message, validateApiResponse, messageSchema } from '@/lib/api-types';

interface PollingState {
  polling: boolean;
  error: string | null;
}

const POLLING_INTERVAL = 1000; // Poll every second
const MAX_RETRIES = 3;

export function usePolling(groupId?: number) {
  const { user } = useAuth();
  const { toast } = useToast();
  const messageHandlers = useRef<Set<(messages: Message[]) => void>>(new Set());
  const retryCount = useRef(0);
  const [state, setState] = useState<PollingState>({
    polling: false,
    error: null
  });

  useEffect(() => {
    if (!user || !groupId) return;

    setState({ polling: true, error: null });
    let intervalId: NodeJS.Timeout;
    let isActive = true;

    const pollMessages = async () => {
      try {
        const response = await fetch(`/api/groups/${groupId}/messages`);

        if (!response.ok) {
          throw new Error('Failed to fetch messages');
        }

        const rawMessages = await response.json();
        const messages = validateApiResponse(messageSchema.array(), rawMessages);

        if (isActive) {
          retryCount.current = 0;
          messageHandlers.current.forEach(handler => handler(messages));
        }
      } catch (error: any) {
        console.error('Polling error:', error);
        retryCount.current++;

        if (retryCount.current >= MAX_RETRIES) {
          setState(prev => ({ ...prev, error: error.message }));
          toast({
            title: 'Connection Error',
            description: 'Failed to fetch messages. Retrying...',
            variant: 'destructive'
          });
        }
      }
    };

    // Start polling
    intervalId = setInterval(pollMessages, POLLING_INTERVAL);

    // Initial poll
    pollMessages();

    return () => {
      isActive = false;
      clearInterval(intervalId);
      setState({ polling: false, error: null });
    };
  }, [user, groupId, toast]);

  const sendMessage = useCallback(async (content: string): Promise<boolean> => {
    if (!user || !groupId) {
      toast({
        title: 'Error',
        description: !user ? 'You must be logged in to send messages' : 'No group selected',
        variant: 'destructive'
      });
      return false;
    }

    try {
      const response = await fetch(`/api/groups/${groupId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: content.trim()
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Failed to send message');
      }

      const newMessage = validateApiResponse(messageSchema, await response.json());

      // Update handlers immediately with the new message
      const response2 = await fetch(`/api/groups/${groupId}/messages`);
      if (response2.ok) {
        const messages = validateApiResponse(messageSchema.array(), await response2.json());
        messageHandlers.current.forEach(handler => handler(messages));
      }

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