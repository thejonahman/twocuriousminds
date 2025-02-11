export function setupWebSocket() {
  let ws: WebSocket | null = null;
  let reconnectAttempt = 0;
  const MAX_RECONNECT_ATTEMPTS = 5;
  const RECONNECT_DELAY = 2000; // 2 seconds

  function connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    console.log('Attempting WebSocket connection to:', wsUrl);
    
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('WebSocket connected');
      reconnectAttempt = 0;
    };

    ws.onclose = (event) => {
      console.log('WebSocket disconnected, code:', event.code, 'reason:', event.reason);
      ws = null;

      if (reconnectAttempt < MAX_RECONNECT_ATTEMPTS) {
        console.log(`Scheduling reconnection attempt ${reconnectAttempt + 1}/${MAX_RECONNECT_ATTEMPTS} in ${RECONNECT_DELAY}ms`);
        setTimeout(() => {
          reconnectAttempt++;
          connect();
        }, RECONNECT_DELAY);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('Received websocket message:', data);
        handleWebSocketMessage(data);
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
      }
    };
  }

  function sendMessage(message: any) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      console.log('Sending WebSocket message:', message);
      ws.send(JSON.stringify(message));
    } else {
      console.error('WebSocket not connected');
    }
  }

  function handleWebSocketMessage(data: any) {
    // Handle different message types
    switch (data.type) {
      case 'new_message':
        // Invalidate react-query cache for messages
        console.log('Invalidating messages query');
        break;
      case 'group_created':
        console.log('Group Created:', data.data);
        break;
      case 'new_group_message':
        // Handle new group message
        break;
      default:
        console.log('Unknown message type:', data.type);
    }
  }

  // Start the initial connection
  connect();

  return {
    sendMessage,
    close: () => {
      console.log('Closing existing WebSocket connection');
      if (ws) {
        ws.close();
      }
    }
  };
}
