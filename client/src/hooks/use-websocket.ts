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

      // Use the current window location to determine the WebSocket URL
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = new URL('/ws', window.location.href);
      wsUrl.protocol = protocol;

      console.log('[WebSocket] Connecting to:', wsUrl.toString());
      const socket = new WebSocket(wsUrl);
      ws.current = socket;

      socket.onopen = () => {
        console.log('[WebSocket] Connected successfully');
        reconnectAttemptsRef.current = 0;
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

        // Use a longer delay for initial connection attempts
        const disconnectionDelay = reconnectAttemptsRef.current === 0 ? 3000 : 1000;

        setTimeout(() => {
          if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
            setState(prev => ({
              ...prev,
              connected: false,
              connecting: false,
              error: isCleanClosure ? null : reconnectAttemptsRef.current >= 3 ? 'Connection closed' : null
            }));
          }
        }, disconnectionDelay);

        // Schedule reconnection for non-clean closures
        if (!isCleanClosure) {
          const backoffDelay = Math.min(1000 * Math.pow(1.5, reconnectAttemptsRef.current), 30000);
          reconnectAttemptsRef.current++;
          console.log(`[WebSocket] Scheduling reconnection in ${backoffDelay}ms...`);
          reconnectTimeoutRef.current = setTimeout(connect, backoffDelay);
        }
      };

      socket.onerror = (error) => {
        console.error('[WebSocket] Connection error:', error);
        // Only show error after multiple failed attempts
        if (reconnectAttemptsRef.current >= 3) {
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

          // Clear any error state and update connection status
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
      // Only show error after multiple attempts
      if (reconnectAttemptsRef.current >= 3) {
        setState(prev => ({
          ...prev,
          connected: false,
          connecting: false,
          error: 'Failed to setup connection'
        }));
      }
    }
  }, [user, state.connecting]);

  // Visibility change handler
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

  // Connection management
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

  return {
    state,
    sendMessage,
    addMessageHandler
  };
}