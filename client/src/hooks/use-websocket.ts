import { useState, useEffect, useRef, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { validateWSMessage, WSMessage, WSInputMessage, validateWSInput } from '@/lib/api-types';

interface WebSocketState {
  connected: boolean;
  connecting: boolean;
  error: string | null;
  lastConnected: number;
  bufferedMessages: WSMessage[];
}

export function useWebSocket() {
  const { user } = useAuth();
  const { toast } = useToast();
  const ws = useRef<WebSocket | null>(null);
  const messageHandlers = useRef<Set<(data: WSMessage) => void>>(new Set());
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectAttemptsRef = useRef(0);
  const lastMessageTimeRef = useRef<number>(Date.now());
  const connectionStartTimeRef = useRef<number>(Date.now());

  const [state, setState] = useState<WebSocketState>({
    connected: false,
    connecting: false,
    error: null,
    lastConnected: 0,
    bufferedMessages: []
  });

  const connect = useCallback(() => {
    if (!user || state.connecting || ws.current?.readyState === WebSocket.OPEN) {
      return;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    connectionStartTimeRef.current = Date.now();
    setState(prev => ({ ...prev, connecting: true, error: null }));

    try {
      if (ws.current) {
        ws.current.close();
        ws.current = null;
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = new URL('/ws', window.location.href);
      wsUrl.protocol = protocol;

      const socket = new WebSocket(wsUrl);
      ws.current = socket;

      socket.onopen = () => {
        reconnectAttemptsRef.current = 0;
        lastMessageTimeRef.current = Date.now();
        setState(prev => ({
          ...prev,
          connected: true,
          connecting: false,
          error: null,
          lastConnected: Date.now()
        }));
      };

      socket.onclose = (event) => {
        const isCleanClosure = event.code === 1000 || event.code === 1001;
        const timeSinceStart = Date.now() - connectionStartTimeRef.current;
        const timeSinceLastMessage = Date.now() - lastMessageTimeRef.current;
        const hasRecentActivity = timeSinceLastMessage < 8000 || timeSinceStart < 5000;

        if (hasRecentActivity && !isCleanClosure) {
          setState(prev => ({
            ...prev,
            connecting: true,
            error: null
          }));
        } else {
          setState(prev => ({
            ...prev,
            connected: false,
            connecting: false,
            error: isCleanClosure ? null : 'Connection closed'
          }));
        }

        if (!isCleanClosure) {
          const backoffDelay = Math.min(1000 * Math.pow(1.5, reconnectAttemptsRef.current), 30000);
          reconnectAttemptsRef.current++;
          reconnectTimeoutRef.current = setTimeout(connect, backoffDelay);
        }
      };

      socket.onerror = (error) => {
        console.error('[WebSocket] Connection error:', error);
        const timeSinceStart = Date.now() - connectionStartTimeRef.current;
        const timeSinceLastMessage = Date.now() - lastMessageTimeRef.current;

        if ((reconnectAttemptsRef.current >= 3 && timeSinceStart > 8000) || timeSinceLastMessage > 15000) {
          setState(prev => ({
            ...prev,
            connected: false,
            connecting: false,
            error: 'Connection error'
          }));
        }
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const validatedMessage = validateWSMessage(data);
          lastMessageTimeRef.current = Date.now();

          setState(prev => ({
            ...prev,
            error: null,
            connected: true,
            connecting: false,
            lastConnected: Date.now(),
            bufferedMessages: [...prev.bufferedMessages, validatedMessage]
          }));

          messageHandlers.current.forEach(handler => handler(validatedMessage));
        } catch (error) {
          console.error('[WebSocket] Message parsing error:', error);
        }
      };
    } catch (error) {
      console.error('[WebSocket] Setup error:', error);
      const timeSinceStart = Date.now() - connectionStartTimeRef.current;
      if (reconnectAttemptsRef.current >= 3 && timeSinceStart > 8000) {
        setState(prev => ({
          ...prev,
          connected: false,
          connecting: false,
          error: 'Failed to setup connection'
        }));
      }
    }
  }, [user, state.connecting]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && user) {
        const timeSinceLastConnection = Date.now() - state.lastConnected;
        if (timeSinceLastConnection > 5000 && (!ws.current || ws.current.readyState !== WebSocket.OPEN)) {
          connect();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [connect, user, state.lastConnected]);

  useEffect(() => {
    if (user) {
      connect();
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (ws.current) {
        ws.current.close(1000, "Cleanup");
        ws.current = null;
      }
    };
  }, [user, connect]);

  const sendMessage = useCallback((message: WSInputMessage): boolean => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
      if (!state.connecting) {
        connect();
      }
      return false;
    }

    try {
      const validatedMessage = validateWSInput(message);
      ws.current.send(JSON.stringify(validatedMessage));
      lastMessageTimeRef.current = Date.now();
      return true;
    } catch (error) {
      console.error('[WebSocket] Send error:', error);
      toast({
        title: "Error",
        description: "Failed to send message",
        variant: "destructive",
      });
      return false;
    }
  }, [state.connecting, connect, toast]);

  const addMessageHandler = useCallback((handler: (data: WSMessage) => void) => {
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