import { useState, useEffect, useRef, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';

export type WebSocketMessage = {
  type: string;
  [key: string]: any;
};

interface WebSocketState {
  connected: boolean;
  connecting: boolean;
}

type MessageHandler = (data: any) => void;

interface UseWebSocketReturn {
  state: WebSocketState;
  sendMessage: (message: WebSocketMessage) => boolean;
  addMessageHandler: (handler: MessageHandler) => () => void;
}

export function useWebSocket(): UseWebSocketReturn {
  const { user } = useAuth();
  const { toast } = useToast();
  const ws = useRef<WebSocket | null>(null);
  const messageHandlers = useRef<Set<MessageHandler>>(new Set());
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectAttemptsRef = useRef(0);
  const [state, setState] = useState<WebSocketState>({
    connected: false,
    connecting: false
  });

  const connect = useCallback(() => {
    if (!user || state.connecting || ws.current?.readyState === WebSocket.OPEN) {
      return;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    setState(prev => ({ ...prev, connecting: true }));

    try {
      if (ws.current) {
        ws.current.close();
        ws.current = null;
      }

      const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/chat`;
      const socket = new WebSocket(wsUrl);
      ws.current = socket;

      socket.onopen = () => {
        reconnectAttemptsRef.current = 0;
        setState({
          connected: true,
          connecting: false
        });
      };

      socket.onclose = (event) => {
        setState({
          connected: false,
          connecting: false
        });

        if (event.code !== 1000 && event.code !== 1001 && user) {
          const baseDelay = 1000;
          const maxDelay = 30000;
          const delay = Math.min(baseDelay * Math.pow(1.5, reconnectAttemptsRef.current), maxDelay);
          reconnectAttemptsRef.current++;

          reconnectTimeoutRef.current = setTimeout(connect, delay);
        }
      };

      socket.onerror = (error) => {
        if (reconnectAttemptsRef.current === 0) {
          toast({
            title: "Connection Error",
            description: "Failed to connect to chat server. Retrying...",
            variant: "destructive",
          });
        }
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          messageHandlers.current.forEach(handler => handler(data));
        } catch (error) {
          console.error('[WebSocket] Message parsing error:', error);
        }
      };

    } catch (error) {
      setState({
        connected: false,
        connecting: false
      });

      toast({
        title: "Connection Error",
        description: "Failed to connect to chat server",
        variant: "destructive",
      });
    }
  }, [user, state.connecting, toast]);

  const sendMessage = useCallback((message: WebSocketMessage): boolean => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      ws.current.send(JSON.stringify(message));
      return true;
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to send message",
        variant: "destructive",
      });
      return false;
    }
  }, [toast]);

  const addMessageHandler = useCallback((handler: MessageHandler) => {
    messageHandlers.current.add(handler);
    return () => {
      messageHandlers.current.delete(handler);
    };
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && user) {
        connect();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [connect, user]);

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

  return {
    state,
    sendMessage,
    addMessageHandler
  };
}