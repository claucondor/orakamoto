#!/bin/bash
# ============================================
# Setup script for StacksPredict on new system
# ============================================

set -e

echo "🚀 Setting up StacksPredict development environment..."

# 1. Check prerequisites
echo ""
echo "📋 Checking prerequisites..."

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Install with:"
    echo "   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
    echo "   sudo apt-get install -y nodejs"
    exit 1
else
    echo "✅ Node.js $(node -v)"
fi

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found. Install with:"
    echo "   curl -fsSL https://get.docker.com | sh"
    echo "   sudo usermod -aG docker $USER"
    echo "   (logout and login again after)"
    exit 1
else
    echo "✅ Docker $(docker -v | cut -d' ' -f3 | tr -d ',')"
fi

# Check if Docker daemon is running
if ! docker info &> /dev/null; then
    echo "❌ Docker daemon not running. Start with:"
    echo "   sudo service docker start"
    exit 1
else
    echo "✅ Docker daemon running"
fi

# Check Clarinet
if ! command -v clarinet &> /dev/null; then
    echo "❌ Clarinet not found. Installing..."
    # Install Clarinet
    curl -L https://github.com/hirosystems/clarinet/releases/download/v2.13.0/clarinet-linux-x64.tar.gz | tar xz
    sudo mv clarinet /usr/local/bin/
    echo "✅ Clarinet installed"
else
    echo "✅ Clarinet $(clarinet --version)"
fi

# 2. Install npm dependencies
echo ""
echo "📦 Installing npm dependencies..."
npm install

# 3. Verify contracts compile
echo ""
echo "🔍 Checking contracts..."
clarinet check

# 4. Run tests
echo ""
echo "🧪 Running tests..."
npm test

# 5. Summary
echo ""
echo "============================================"
echo "✅ Setup complete!"
echo "============================================"
echo ""
echo "Next steps:"
echo "  1. Start devnet:     clarinet devnet start"
echo "  2. Run tests:        npm test"
echo "  3. Deploy testnet:   clarinet deployments generate --testnet --medium-cost"
echo "                       clarinet deployments apply --testnet"
echo ""
echo "Important files:"
echo "  - settings/Testnet.toml  - Testnet wallet config"
echo "  - settings/Devnet.toml   - Devnet wallet config"
echo "  - Clarinet.toml          - Contract definitions"
echo ""
