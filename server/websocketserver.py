import asyncio
import websockets
from typing import Set, Callable, Optional, Dict, Any
import json


class SocketServer:
    def __init__(self, on_message: Optional[Callable[[Dict[str, Any]], None]] = None, config_callback: Optional[Callable[[], Dict[str, Any]]] = None, initial_notes_callback: Optional[Callable[[], Dict[str, Any]]] = None, device_status_callback: Optional[Callable[[], Dict[str, Any]]] = None):
        self.sockets: Set[websockets.WebSocketServerProtocol] = set()
        self.server = None
        self.loop = None
        self.on_message_callback = on_message
        self.config_callback = config_callback
        self.initial_notes_callback = initial_notes_callback
        self.device_status_callback = device_status_callback

    async def start(self, port: int = 8080, host: str = '0.0.0.0'):
        """Start the WebSocket server"""
        # Store the event loop for cross-thread access
        self.loop = asyncio.get_event_loop()
        print(f'WebSocket server is running on ws://{host}:{port}')
        
        async def handle_client(websocket):
            print('New client connected')
            self.sockets.add(websocket)
            
            # Send the current config to the new client
            if self.config_callback is not None:
                try:
                    config_data = self.config_callback()
                    config_message = json.dumps({
                        'type': 'config',
                        'config': config_data
                    })
                    await websocket.send(config_message)
                except Exception as e:
                    print(f'Error sending config to new client: {e}')
            
            # Send the current strummer notes to the new client
            if self.initial_notes_callback is not None:
                try:
                    notes_data = self.initial_notes_callback()
                    notes_message = json.dumps(notes_data)
                    await websocket.send(notes_message)
                except Exception as e:
                    print(f'Error sending initial notes to new client: {e}')
            
            # Send the current device status to the new client
            if self.device_status_callback is not None:
                try:
                    device_status = self.device_status_callback()
                    device_message = json.dumps(device_status)
                    await websocket.send(device_message)
                    print(f'[WebSocket] Sent initial device status to client: connected={device_status.get("connected")}')
                except Exception as e:
                    print(f'Error sending device status to new client: {e}')
            
            try:
                # Listen for incoming messages
                async for message in websocket:
                    try:
                        # Parse incoming message as JSON
                        data = json.loads(message)
                        
                        # Call the message callback if it exists
                        if self.on_message_callback:
                            self.on_message_callback(data)
                            
                    except json.JSONDecodeError as e:
                        print(f'Error parsing message as JSON: {e}')
                    except Exception as e:
                        print(f'Error processing message: {e}')
            except websockets.exceptions.ConnectionClosed:
                pass
            finally:
                print('Client disconnected')
                self.sockets.discard(websocket)
        
        self.server = await websockets.serve(handle_client, host, port)
        return self.server

    def stop(self):
        """Stop the WebSocket server (synchronous wrapper)"""
        if self.loop and self.loop.is_running():
            # Schedule the async stop in the event loop
            future = asyncio.run_coroutine_threadsafe(self.async_stop(), self.loop)
            try:
                # Wait for it to complete (with timeout)
                future.result(timeout=3.0)
            except Exception as e:
                print(f'Warning during server stop: {e}')
        else:
            # If loop not running, just close the server
            if self.server:
                self.server.close()
    
    async def async_stop(self):
        """Async stop method - properly closes server and connections"""
        print('Server stopping...')
        
        # Close all active websocket connections
        if self.sockets:
            sockets_copy = self.sockets.copy()
            close_tasks = []
            for socket in sockets_copy:
                try:
                    close_tasks.append(socket.close())
                except Exception as e:
                    print(f'Error closing socket: {e}')
            
            # Wait for all connections to close
            if close_tasks:
                await asyncio.gather(*close_tasks, return_exceptions=True)
            
            self.sockets.clear()
        
        # Close the server
        if self.server:
            self.server.close()
            try:
                await self.server.wait_closed()
                print('Server closed successfully')
            except Exception as e:
                print(f'Error waiting for server close: {e}')

    async def send_message(self, message: str):
        """Send message to all connected clients"""
        if self.sockets:
            # Create a copy of the set to avoid modification during iteration
            sockets_copy = self.sockets.copy()
            for socket in sockets_copy:
                try:
                    await socket.send(message)
                except websockets.exceptions.ConnectionClosed:
                    # Remove disconnected socket
                    self.sockets.discard(socket)
                except Exception as e:
                    print(f"Error sending message: {e}")
                    self.sockets.discard(socket)

    def send_message_sync(self, message: str):
        """Synchronous wrapper for send_message - thread-safe"""
        if self.sockets and self.loop:
            # Schedule the coroutine in the server's event loop (thread-safe)
            asyncio.run_coroutine_threadsafe(self.send_message(message), self.loop)

