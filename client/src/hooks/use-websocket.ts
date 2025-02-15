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
  const mountedRef = useRef(true);
  const [state, setState] = useState<WebSocketState>({
    connected: false,
    connecting: false
  });

  const cleanupConnection = useCallback(() => {
    if (ws.current) {
      try {
        ws.current.close(1000, "Cleanup");
      } catch (e) {
        console.error('[WebSocket] Error during cleanup:', e);
      }
      ws.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = undefined;
    }
  }, []);

  const connect = useCallback(() => {
    if (!user || !mountedRef.current || state.connecting || ws.current?.readyState === WebSocket.OPEN) {
      return;
    }

    cleanupConnection();
    setState(prev => ({ ...prev, connecting: true }));

    try {
      // Get the correct protocol and port
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const port = window.location.port ? `:${window.location.port}` : '';
      const wsUrl = `${protocol}//${window.location.hostname}${port}/ws`;

      console.log('[WebSocket] Attempting connection to:', wsUrl);

      const socket = new WebSocket(wsUrl);
      ws.current = socket;

      socket.onopen = () => {
        if (!mountedRef.current) return;
        console.log('[WebSocket] Connection established');
        reconnectAttemptsRef.current = 0;
        setState({
          connected: true,
          connecting: false
        });
      };

      socket.onclose = (event) => {
        if (!mountedRef.current) return;
        console.log('[WebSocket] Connection closed:', {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
          attempts: reconnectAttemptsRef.current
        });

        setState({
          connected: false,
          connecting: false
        });

        // Only reconnect if closure wasn't clean and we're still mounted
        if (mountedRef.current && user && event.code !== 1000 && event.code !== 1001) {
          const delay = 2000; // Fixed 2-second delay for simplicity
          console.log('[WebSocket] Scheduling reconnect:', {
            delay,
            nextAttempt: reconnectAttemptsRef.current + 1
          });

          reconnectTimeoutRef.current = setTimeout(() => {
            if (mountedRef.current) {
              reconnectAttemptsRef.current++;
              connect();
            }
          }, delay);
        }
      };

      socket.onmessage = (event) => {
        if (!mountedRef.current) return;
        try {
          const data = JSON.parse(event.data);
          console.log('[WebSocket] Received:', data);
          messageHandlers.current.forEach(handler => handler(data));
        } catch (error) {
          console.error('[WebSocket] Message parsing error:', error);
        }
      };

      socket.onerror = (error) => {
        if (!mountedRef.current) return;
        console.error('[WebSocket] Connection error:', error);
      };

    } catch (error) {
      if (!mountedRef.current) return;
      console.error('[WebSocket] Setup error:', error);
      setState({
        connected: false,
        connecting: false
      });
    }
  }, [user, state.connecting, cleanupConnection]);

  const sendMessage = useCallback((message: WebSocketMessage): boolean => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      ws.current.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error('[WebSocket] Send error:', error);
      return false;
    }
  }, []);

  const addMessageHandler = useCallback((handler: MessageHandler) => {
    messageHandlers.current.add(handler);
    return () => {
      messageHandlers.current.delete(handler);
    };
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (user) {
      connect();
    }

    return () => {
      mountedRef.current = false;
      cleanupConnection();
    };
  }, [user, connect, cleanupConnection]);

  return {
    state,
    sendMessage,
    addMessageHandler
  };
}