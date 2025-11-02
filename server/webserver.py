import os
import threading
from http.server import HTTPServer, SimpleHTTPRequestHandler
from typing import Optional


class StaticFileHandler(SimpleHTTPRequestHandler):
    """Custom handler to serve files from a specific directory"""
    
    def __init__(self, *args, directory=None, **kwargs):
        self.directory = directory
        super().__init__(*args, directory=directory, **kwargs)
    
    def log_message(self, format, *args):
        """Override to provide cleaner logging"""
        # Only log actual HTTP requests, not every resource
        if args[1] == '200':
            print(f"[HTTP] {args[0]} - {self.path}")
        elif args[1] != '304':  # Skip 'Not Modified' responses
            print(f"[HTTP] {args[0]} - {self.path} - Status: {args[1]}")


class ReuseAddrHTTPServer(HTTPServer):
    """HTTPServer that allows address reuse"""
    allow_reuse_address = True


class WebServer:
    """Simple HTTP server for serving static files"""
    
    def __init__(self, directory: str, port: int = 80):
        """
        Initialize the web server.
        
        Args:
            directory: Directory to serve files from
            port: Port to listen on (default: 80)
        """
        self.directory = os.path.abspath(directory)
        self.port = port
        self.server: Optional[HTTPServer] = None
        self.thread: Optional[threading.Thread] = None
        
        if not os.path.exists(self.directory):
            raise ValueError(f"Directory does not exist: {self.directory}")
        
        if not os.path.isdir(self.directory):
            raise ValueError(f"Path is not a directory: {self.directory}")
    
    def start(self) -> None:
        """Start the HTTP server in a background thread"""
        if self.server is not None:
            print("[HTTP] Server is already running")
            return
        
        def run_server():
            """Run the HTTP server in a thread"""
            try:
                # Create a handler class with the directory bound
                handler = lambda *args, **kwargs: StaticFileHandler(
                    *args, 
                    directory=self.directory, 
                    **kwargs
                )
                
                # Create server with address reuse enabled
                self.server = ReuseAddrHTTPServer(('', self.port), handler)
                print(f"[HTTP] Web server started on http://localhost:{self.port}")
                print(f"[HTTP] Serving files from: {self.directory}")
                self.server.serve_forever()
            except OSError as e:
                if e.errno == 48 or e.errno == 98:  # Address already in use
                    print(f"[HTTP] Error: Port {self.port} is already in use")
                elif e.errno == 13:  # Permission denied
                    print(f"[HTTP] Error: Permission denied for port {self.port}")
                    print(f"[HTTP] Tip: Ports below 1024 require root/admin privileges")
                else:
                    print(f"[HTTP] Error starting web server: {e}")
            except Exception as e:
                print(f"[HTTP] Unexpected error starting web server: {e}")
        
        self.thread = threading.Thread(target=run_server, daemon=True)
        self.thread.start()
        
        # Give the server a moment to start
        import time
        time.sleep(0.2)
    
    def stop(self) -> None:
        """Stop the HTTP server"""
        if self.server is not None:
            print("[HTTP] Stopping web server...")
            self.server.shutdown()
            self.server.server_close()
            self.server = None
            
            if self.thread is not None:
                self.thread.join(timeout=2.0)
                self.thread = None
            
            print("[HTTP] Web server stopped")

