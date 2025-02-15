import { useState, useEffect, useRef, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { validateWSMessage, WSMessage, WSInputMessage, validateWSInput } from '@/lib/api-types';

interface WebSocketState {
  connected: boolean;
  connecting: boolean;
  error: string | null;
}

export function useWebSocket() {
  const { user } = useAuth();
  const { toast } = useToast();
  const ws = useRef<WebSocket | null>(null);
  const messageHandlers = useRef<Set<(data: WSMessage) => void>>(new Set());
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectAttemptsRef = useRef(0);
  const [state, setState] = useState<WebSocketState>({
    connected: false,
    connecting: false,
    error: null
  });

  const connect = useCallback(() => {
    if (!user || state.connecting || ws.current?.readyState === WebSocket.OPEN) {
      return;
    }

    // Clear any existing reconnection timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    setState(prev => ({ ...prev, connecting: true, error: null }));
    console.log('[WebSocket] Attempting to connect...');

    try {
      // Close existing connection if any
      if (ws.current) {
        ws.current.close();
        ws.current = null;
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const port = window.location.port || (window.location.protocol === 'https:' ? '443' : '80');
      const wsUrl = `${protocol}//${window.location.hostname}:${port}/ws`;
      console.log('[WebSocket] Connecting to:', wsUrl);

      const socket = new WebSocket(wsUrl);
      ws.current = socket;

      socket.onopen = () => {
        console.log('[WebSocket] Connected successfully');
        reconnectAttemptsRef.current = 0;
        setState({
          connected: true,
          connecting: false,
          error: null
        });
      };

      socket.onclose = (event) => {
        console.log('[WebSocket] Connection closed:', event.code, event.reason);
        setState({
          connected: false,
          connecting: false,
          error: event.code !== 1000 && event.code !== 1001 ? 'Connection closed' : null
        });

        // Only attempt to reconnect if not a clean closure
        if (event.code !== 1000 && event.code !== 1001) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 10000);
          reconnectAttemptsRef.current++;
          console.log(`[WebSocket] Attempting to reconnect in ${delay}ms...`);
          reconnectTimeoutRef.current = setTimeout(connect, delay);
        }
      };

      socket.onerror = (error) => {
        console.error('[WebSocket] Connection error:', error);
        setState(prev => ({
          connected: false,
          connecting: false,
          error: 'Failed to connect'
        }));

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
          console.log('[WebSocket] Message received:', data);
          const validatedMessage = validateWSMessage(data);
          messageHandlers.current.forEach(handler => handler(validatedMessage));
        } catch (error) {
          console.error('[WebSocket] Message parsing error:', error);
        }
      };
    } catch (error) {
      console.error('[WebSocket] Setup error:', error);
      setState({
        connected: false,
        connecting: false,
        error: 'Failed to setup connection'
      });

      toast({
        title: "Connection Error",
        description: "Failed to connect to chat server",
        variant: "destructive",
      });
    }
  }, [user, state.connecting, toast]);

  // Add visibility change handler to reconnect when tab becomes visible
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

  const sendMessage = useCallback((message: WSInputMessage): boolean => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
      console.log('[WebSocket] Cannot send message - not connected');
      toast({
        title: "Error",
        description: "Not connected to chat server",
        variant: "destructive",
      });
      return false;
    }

    try {
      const validatedMessage = validateWSInput(message);
      console.log('[WebSocket] Sending message:', validatedMessage);
      ws.current.send(JSON.stringify(validatedMessage));
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

  const addMessageHandler = useCallback((handler: (data: WSMessage) => void) => {
    messageHandlers.current.add(handler);
    return () => {
      messageHandlers.current.delete(handler);
    };
  }, []);

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