#!/usr/bin/env bash
# ==============================================================================
# ApexTrade AI - Unified Full-Stack Launcher
# Runs Python REST API Backend (Port 5001) + React/Vite Frontend (Port 3001)
# ==============================================================================

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

echo "=================================================================="
echo "⚡ Launching Full-Stack ApexTrade AI Terminal..."
echo "=================================================================="

# Check Python environment
if ! command -v python3 &> /dev/null; then
    echo "❌ Error: python3 could not be found."
    exit 1
fi

# Check Node environment
if ! command -v npm &> /dev/null; then
    echo "❌ Error: npm could not be found."
    exit 1
fi

# Ensure frontend node_modules exist
if [ ! -d "frontend/node_modules" ]; then
    echo "📦 Installing frontend dependencies..."
    cd frontend && npm install && cd ..
fi

# Start Backend API Server
echo "🚀 [1/2] Starting Python REST API Server on port 5001..."
python3 server.py &
BACKEND_PID=$!

# Wait for backend to become available
sleep 2

# Start Frontend Dev Server
echo "⚡ [2/2] Starting React + Vite Frontend on port 3001..."
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "=================================================================="
echo "✅ ApexTrade AI Terminal is LIVE!"
echo "   ▶ Frontend Terminal: http://localhost:3001"
echo "   ▶ Backend REST API:  http://localhost:5001"
echo "   ▶ API Health:        http://localhost:5001/api/health"
echo "=================================================================="
echo "Press Ctrl+C to stop both servers."

# Graceful cleanup on Ctrl+C
cleanup() {
    echo ""
    echo "🛑 Shutting down Full-Stack servers..."
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    exit 0
}

trap cleanup SIGINT SIGTERM

wait
