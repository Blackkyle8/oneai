#!/bin/bash

# OneAI PostgreSQL Setup Script
# This script sets up PostgreSQL database and user for OneAI application

set -e  # Exit on any error

echo "🚀 Starting OneAI PostgreSQL setup..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if PostgreSQL is installed
if ! command -v psql &> /dev/null; then
    echo -e "${RED}❌ PostgreSQL is not installed. Please install PostgreSQL first.${NC}"
    exit 1
fi

# Start PostgreSQL service if not running
echo -e "${YELLOW}🔧 Checking PostgreSQL service...${NC}"
if ! sudo systemctl is-active --quiet postgresql; then
    echo -e "${YELLOW}🔄 Starting PostgreSQL service...${NC}"
    sudo systemctl start postgresql
    sudo systemctl enable postgresql
    echo -e "${GREEN}✅ PostgreSQL service started${NC}"
else
    echo -e "${GREEN}✅ PostgreSQL service is already running${NC}"
fi

# Database configuration
DB_USER="oneai"
DB_PASSWORD="oneai123"
DB_NAME="oneai"

echo -e "${YELLOW}🔧 Setting up database and user...${NC}"

# Check if user exists
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1; then
    echo -e "${GREEN}✅ User '$DB_USER' already exists${NC}"
else
    echo -e "${YELLOW}🔄 Creating user '$DB_USER'...${NC}"
    sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';"
    echo -e "${GREEN}✅ User '$DB_USER' created${NC}"
fi

# Check if database exists
if sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw $DB_NAME; then
    echo -e "${GREEN}✅ Database '$DB_NAME' already exists${NC}"
else
    echo -e "${YELLOW}🔄 Creating database '$DB_NAME'...${NC}"
    sudo -u postgres createdb -O $DB_USER $DB_NAME
    echo -e "${GREEN}✅ Database '$DB_NAME' created${NC}"
fi

# Grant privileges
echo -e "${YELLOW}🔧 Granting privileges...${NC}"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"
sudo -u postgres psql -d $DB_NAME -c "GRANT ALL ON SCHEMA public TO $DB_USER;"
echo -e "${GREEN}✅ Privileges granted${NC}"

# Test connection
echo -e "${YELLOW}🔧 Testing database connection...${NC}"
if PGPASSWORD=$DB_PASSWORD psql -h localhost -U $DB_USER -d $DB_NAME -c "SELECT NOW();" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Database connection test successful${NC}"
else
    echo -e "${RED}❌ Database connection test failed${NC}"
    exit 1
fi

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}🔧 Creating .env configuration file...${NC}"
    cat > .env << EOF
# Database Configuration
DB_HOST=localhost
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
DB_NAME=$DB_NAME
DB_PORT=5432

# Application Configuration
NODE_ENV=development
PORT=3000

# Session and JWT Secrets (using development defaults)
SESSION_SECRET=oneai_dev_session_secret_2024
JWT_SECRET=oneai_dev_jwt_secret_2024

# OAuth Configuration (placeholder values for development)
GOOGLE_CLIENT_ID=development_client_id
GOOGLE_CLIENT_SECRET=development_client_secret

# Apple OAuth Configuration (placeholder values for development)
APPLE_CLIENT_ID=development_apple_client_id
APPLE_TEAM_ID=development_apple_team_id
APPLE_KEY_ID=development_apple_key_id
APPLE_KEY_PATH=/tmp/development_apple_key.p8
EOF
    echo -e "${GREEN}✅ .env file created${NC}"
else
    echo -e "${GREEN}✅ .env file already exists${NC}"
fi

# Create dummy Apple key file for development
if [ ! -f "/tmp/development_apple_key.p8" ]; then
    echo -e "${YELLOW}🔧 Creating dummy Apple key file for development...${NC}"
    cat > /tmp/development_apple_key.p8 << EOF
-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgDevelopmentKeyForTesting
DevelopmentKeyForTestingDevelopmentKeyForTesting=
-----END PRIVATE KEY-----
EOF
    echo -e "${GREEN}✅ Dummy Apple key file created${NC}"
fi

# Install npm dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}🔧 Installing npm dependencies...${NC}"
    npm install
    echo -e "${GREEN}✅ npm dependencies installed${NC}"
else
    echo -e "${GREEN}✅ npm dependencies already installed${NC}"
fi

# Initialize database tables
echo -e "${YELLOW}🔧 Initializing database tables...${NC}"
npm run db:create
echo -e "${GREEN}✅ Database tables initialized${NC}"

echo
echo -e "${GREEN}🎉 OneAI PostgreSQL setup completed successfully!${NC}"
echo
echo -e "${YELLOW}📋 Setup Summary:${NC}"
echo -e "   • Database: $DB_NAME"
echo -e "   • User: $DB_USER"
echo -e "   • Password: $DB_PASSWORD"
echo -e "   • Host: localhost"
echo -e "   • Port: 5432"
echo
echo -e "${YELLOW}🚀 To start the application:${NC}"
echo -e "   npm start"
echo
echo -e "${YELLOW}🔑 Test Account:${NC}"
echo -e "   • Email: test@oneai.com"
echo -e "   • Password: test1234"
echo
echo -e "${YELLOW}🌐 Application will be available at:${NC}"
echo -e "   • Frontend: http://localhost:3000"
echo -e "   • API Health: http://localhost:3000/api/health"
echo