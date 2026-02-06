#!/bin/bash

# Multi-View Posture Data Collection - Quick Setup Script
# This script helps set up the project quickly

set -e  # Exit on error

echo "================================================"
echo "  Posture Data Collection Platform Setup"
echo "================================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check Node.js
echo "Checking Node.js..."
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js not found. Please install Node.js 18+ first.${NC}"
    exit 1
fi
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}❌ Node.js version must be 18 or higher. Current: $(node -v)${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Node.js $(node -v) found${NC}"

# Check npm
echo "Checking npm..."
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm not found${NC}"
    exit 1
fi
echo -e "${GREEN}✓ npm $(npm -v) found${NC}"

# Check PostgreSQL
echo "Checking PostgreSQL..."
if ! command -v psql &> /dev/null; then
    echo -e "${YELLOW}⚠ PostgreSQL not found locally. You can use Supabase instead.${NC}"
    USE_SUPABASE=true
else
    echo -e "${GREEN}✓ PostgreSQL found${NC}"
    USE_SUPABASE=false
fi

echo ""
echo "================================================"
echo "  Step 1: Backend Setup"
echo "================================================"
echo ""

cd backend

# Install backend dependencies
echo "Installing backend dependencies..."
npm install
echo -e "${GREEN}✓ Backend dependencies installed${NC}"

# Setup .env
if [ ! -f .env ]; then
    echo ""
    echo "Creating backend .env file..."
    cp .env.example .env
    echo -e "${YELLOW}⚠ Please edit backend/.env with your database and storage credentials${NC}"
    echo ""
    
    if [ "$USE_SUPABASE" = true ]; then
        echo "Recommended configuration for Supabase:"
        echo "1. Create a Supabase project at https://supabase.com"
        echo "2. Get your database connection details from Settings > Database"
        echo "3. Get your Storage credentials from Settings > API"
        echo "4. Update backend/.env with these values"
    else
        echo "For local PostgreSQL:"
        echo "1. Create database: createdb posture_data"
        echo "2. Run schema: psql posture_data < database-schema.sql"
        echo "3. Update backend/.env with your database credentials"
    fi
fi

cd ..

echo ""
echo "================================================"
echo "  Step 2: Frontend Setup"
echo "================================================"
echo ""

cd frontend

# Install frontend dependencies
echo "Installing frontend dependencies..."
npm install
echo -e "${GREEN}✓ Frontend dependencies installed${NC}"

# Setup .env.local
if [ ! -f .env.local ]; then
    echo ""
    echo "Creating frontend .env.local file..."
    cp .env.local.example .env.local
    echo -e "${GREEN}✓ Frontend .env.local created (default values should work for local dev)${NC}"
fi

cd ..

echo ""
echo "================================================"
echo "  Setup Complete!"
echo "================================================"
echo ""
echo -e "${GREEN}✓ Backend is ready${NC}"
echo -e "${GREEN}✓ Frontend is ready${NC}"
echo ""
echo "Next steps:"
echo ""
echo "1. Configure database and storage:"
echo "   - Edit backend/.env with your credentials"
echo "   - Run database schema if using PostgreSQL:"
echo "     psql posture_data < database-schema.sql"
echo ""
echo "2. Start the backend:"
echo "   cd backend"
echo "   npm run start:dev"
echo ""
echo "3. In a new terminal, start the frontend:"
echo "   cd frontend"
echo "   npm run dev"
echo ""
echo "4. Open http://localhost:3000 in your browser"
echo ""
echo "================================================"
echo "  Useful Commands"
echo "================================================"
echo ""
echo "Backend (in backend/):"
echo "  npm run start:dev  - Start development server"
echo "  npm run build      - Build for production"
echo "  npm run start:prod - Start production server"
echo ""
echo "Frontend (in frontend/):"
echo "  npm run dev        - Start development server"
echo "  npm run build      - Build for production"
echo "  npm run start      - Start production server"
echo ""
echo "For detailed setup instructions, see:"
echo "  docs/SETUP_GUIDE.md"
echo ""
echo -e "${GREEN}Happy coding! 🚀${NC}"
echo ""
