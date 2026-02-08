#!/bin/bash

# Swapper Setup Script
# This script helps you set up the development environment quickly

set -e  # Exit on error

echo "🚀 Swapper Setup Script"
echo "======================="
echo ""

# Check if bun is installed
if ! command -v bun &> /dev/null; then
    echo "❌ Bun is not installed"
    echo "   Install from: https://bun.sh"
    exit 1
fi

echo "✅ Bun is installed"

# Check if .env exists
if [ ! -f .env ]; then
    echo ""
    echo "📝 Creating .env file from .env.example..."
    cp .env.example .env
    echo "⚠️  Please edit .env and add your configuration:"
    echo "   - SPONSOR_WALLET_PRIVATE_KEY (REQUIRED)"
    echo "   - DATABASE_URL (REQUIRED)"
    echo ""
    read -p "Press Enter when you've configured .env..."
fi

echo ""
echo "📦 Installing dependencies..."
bun install

echo ""
echo "🗄️  Setting up database..."

# Check if DATABASE_URL is set
if grep -q "DATABASE_URL=postgresql://user:pass@localhost:5432/swapper" .env; then
    echo "⚠️  Using default DATABASE_URL"
    echo "   Make sure PostgreSQL is running locally"
fi

# Generate Prisma client
echo "   Generating Prisma client..."
bun db:generate

# Push schema to database
echo "   Pushing schema to database..."
bun db:push || {
    echo "❌ Database setup failed"
    echo "   Make sure PostgreSQL is running and DATABASE_URL is correct"
    exit 1
}

echo ""
echo "✅ Setup complete!"
echo ""
echo "🎯 Next steps:"
echo "   1. Make sure you've set SPONSOR_WALLET_PRIVATE_KEY in .env"
echo "   2. Fund the sponsor wallet with at least 0.1 SOL"
echo "   3. Run: bun dev"
echo "   4. Visit: http://localhost:3000"
echo ""
echo "📚 For more information, see SETUP.md"
echo ""
