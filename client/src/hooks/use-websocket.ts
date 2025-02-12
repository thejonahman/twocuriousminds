import { useState, useEffect, useRef, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';

const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY = 1000;
const MAX_RETRY_DELAY = 30000;

interface WebSocketState {
  connected: boolean;
  connecting: boolean;
  retryCount: number;
  retryDelay: number;
}

export function useWebSocket() {
  const { user } = useAuth();
  const { toast } = useToast();
  const socketRef = useRef<WebSocket | null>(null);
  const [wsState, setWsState] = useState<WebSocketState>({
    connected: false,
    connecting: false,
    retryCount: 0,
    retryDelay: INITIAL_RETRY_DELAY,
  });
  const reconnectTimeoutRef = useRef<number>();
  const messageHandlersRef = useRef<((event: MessageEvent) => void)[]>([]);

  const wsHost = window.location.host.includes('localhost') ?
    `${window.location.hostname}:${import.meta.env.VITE_PORT || 3000}` :
    window.location.host;

  const connect = useCallback(() => {
    if (!user || wsState.connecting) return;

    // Close existing connection if any
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }

    setWsState(prev => ({ ...prev, connecting: true }));

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${wsHost}/ws`;
      console.log('[WebSocket] Attempting to connect to:', wsUrl);

      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        console.log('[WebSocket] Connection opened');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[WebSocket] Message received:', data);

          if (data.type === 'connected') {
            console.log('[WebSocket] Connected successfully');
            setWsState({
              connected: true,
              connecting: false,
              retryCount: 0,
              retryDelay: INITIAL_RETRY_DELAY,
            });
          }

          // Notify all registered message handlers
          messageHandlersRef.current.forEach(handler => handler(event));
        } catch (error) {
          console.error('[WebSocket] Message parsing error:', error);
        }
      };

      ws.onclose = (event) => {
        console.log('[WebSocket] Connection closed:', event.code, event.reason);
        setWsState(prev => ({
          ...prev,
          connected: false,
          connecting: false,
        }));

        if (event.code !== 1000 && event.code !== 1001 && wsState.retryCount < MAX_RETRIES) {
          const nextDelay = Math.min(wsState.retryDelay * 2, MAX_RETRY_DELAY);
          console.log(`[WebSocket] Scheduling reconnection attempt ${wsState.retryCount + 1}/${MAX_RETRIES} in ${nextDelay}ms`);

          reconnectTimeoutRef.current = window.setTimeout(() => {
            setWsState(prev => ({
              ...prev,
              retryCount: prev.retryCount + 1,
              retryDelay: nextDelay,
            }));
            connect();
          }, nextDelay);
        } else if (wsState.retryCount >= MAX_RETRIES) {
          toast({
            title: "Connection Error",
            description: "Maximum reconnection attempts reached. Please refresh the page.",
            variant: "destructive",
          });
        }
      };

      ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
      };

    } catch (error) {
      console.error('[WebSocket] Setup error:', error);
      setWsState(prev => ({
        ...prev,
        connected: false,
        connecting: false,
      }));
    }
  }, [user, wsState.connecting, wsState.retryCount, wsState.retryDelay, wsHost, toast]);

  useEffect(() => {
    if (!user) return;

    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current);
      }
      if (socketRef.current) {
        socketRef.current.close(1000, 'Component unmounting');
      }
    };
  }, [user, connect]);

  const sendMessage = useCallback((data: unknown) => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      toast({
        title: "Connection Error",
        description: "Not connected to chat server",
        variant: "destructive",
      });
      return false;
    }

    try {
      socketRef.current.send(JSON.stringify(data));
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
  }, [toast]);

  const addMessageHandler = useCallback((handler: (event: MessageEvent) => void) => {
    messageHandlersRef.current.push(handler);
    return () => {
      messageHandlersRef.current = messageHandlersRef.current.filter(h => h !== handler);
    };
  }, []);

  return {
    wsState,
    sendMessage,
    addMessageHandler
  };
}