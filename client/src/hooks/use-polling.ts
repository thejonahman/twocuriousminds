import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Message } from '@/lib/api-types';

interface PollingState {
  polling: boolean;
  error: string | null;
}

export function usePolling(groupId?: number) {
  const { user } = useAuth();
  const { toast } = useToast();
  const abortControllerRef = useRef<AbortController | null>(null);
  const messageHandlers = useRef<Set<(messages: Message[]) => void>>(new Set());
  const [state, setState] = useState<PollingState>({
    polling: false,
    error: null
  });

  const startPolling = useCallback(async () => {
    if (!user || !groupId || state.polling) return;

    setState({ polling: true, error: null });
    abortControllerRef.current = new AbortController();

    try {
      while (!abortControllerRef.current?.signal.aborted) {
        const response = await fetch(
          `/api/poll/messages?groupId=${groupId}&timeout=30000`,
          {
            signal: abortControllerRef.current?.signal
          }
        );

        if (!response.ok) {
          throw new Error('Failed to fetch messages');
        }

        const messages = await response.json();
        if (messages.length > 0) {
          messageHandlers.current.forEach(handler => handler(messages));
        }
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Polling error:', error);
        setState(prev => ({ ...prev, error: error.message }));
        toast({
          title: 'Error',
          description: 'Failed to receive messages. Retrying...',
          variant: 'destructive'
        });
        // Retry after a short delay
        setTimeout(startPolling, 5000);
      }
    }
  }, [user, groupId, state.polling, toast]);

  const sendMessage = useCallback(async (content: string): Promise<boolean> => {
    if (!user || !groupId) {
      toast({
        title: 'Error',
        description: 'Cannot send message - not connected',
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
        throw new Error('Failed to send message');
      }

      return true;
    } catch (error) {
      console.error('Send message error:', error);
      toast({
        title: 'Error',
        description: 'Failed to send message',
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

  useEffect(() => {
    if (user && groupId) {
      startPolling();
    }

    return () => {
      if (abortControllerRef.current) {
        try {
          abortControllerRef.current.abort();
        } catch (error) {
          console.error('Error aborting polling:', error);
        }
        abortControllerRef.current = null;
      }
      setState({ polling: false, error: null });
    };
  }, [user, groupId, startPolling]);

  return {
    state,
    sendMessage,
    addMessageHandler
  };
}