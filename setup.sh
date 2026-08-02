#!/bin/bash
set -e

echo "🚀 Setting up External Trading Engine..."

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

pip install --upgrade pip
pip install -r requirements.txt

# Setup environment
if [ ! -f .env ]; then
    cp .env.example .env
    echo "✅ Created .env from example. Please edit it with your API keys."
fi

mkdir -p logs

echo ""
echo "✅ Setup complete!"
echo "Next steps:"
echo "1. Edit .env file with your keys"
echo "2. Run: source venv/bin/activate && uvicorn app.main:app --host 0.0.0.0 --port 8000"
echo ""
echo "Or use Docker: docker compose up -d"