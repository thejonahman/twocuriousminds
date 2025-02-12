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

export function useWebSocket() {
  const { user } = useAuth();
  const { toast } = useToast();
  const ws = useRef<WebSocket | null>(null);
  const messageHandlers = useRef<Set<(data: any) => void>>(new Set());
  const [state, setState] = useState<WebSocketState>({
    connected: false,
    connecting: false
  });

  const connect = useCallback(() => {
    if (!user || state.connecting || ws.current?.readyState === WebSocket.OPEN) {
      return;
    }

    // Close existing connection if any
    if (ws.current) {
      ws.current.close();
      ws.current = null;
    }

    setState(prev => ({ ...prev, connecting: true }));

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      console.log('[WebSocket] Connecting to:', wsUrl);

      const socket = new WebSocket(wsUrl);
      ws.current = socket;

      socket.onopen = () => {
        console.log('[WebSocket] Connected successfully');
        setState({
          connected: true,
          connecting: false
        });
      };

      socket.onclose = () => {
        console.log('[WebSocket] Connection closed');
        setState({
          connected: false,
          connecting: false
        });

        // Simple reconnection after 5 seconds
        setTimeout(connect, 5000);
      };

      socket.onerror = (error) => {
        console.error('[WebSocket] Connection error:', error);
        setState(prev => ({ ...prev, connected: false }));
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[WebSocket] Message received:', data);
          messageHandlers.current.forEach(handler => handler(data));
        } catch (error) {
          console.error('[WebSocket] Message parsing error:', error);
        }
      };
    } catch (error) {
      console.error('[WebSocket] Setup error:', error);
      setState({
        connected: false,
        connecting: false
      });
    }
  }, [user, state.connecting]);

  const sendMessage = useCallback((message: WebSocketMessage): boolean => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
      toast({
        title: "Error",
        description: "Not connected to chat server",
        variant: "destructive",
      });
      return false;
    }

    try {
      ws.current.send(JSON.stringify(message));
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

  const addMessageHandler = useCallback((handler: (data: any) => void) => {
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
      if (ws.current) {
        ws.current.close(1000, "Component unmounted");
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