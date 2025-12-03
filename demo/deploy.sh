#!/bin/bash

set -e

echo "========================================="
echo "OnChain Merklized Issuer Demo Deployment"
echo "========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo -e "${YELLOW}Step 1: Stopping and removing existing containers and volumes...${NC}"
docker-compose down -v
echo -e "${GREEN}✓ Containers stopped and removed${NC}"
echo ""

echo -e "${YELLOW}Step 2: Cleaning up old data...${NC}"
# Remove Docker volumes
docker volume prune -f >/dev/null 2>&1 || true
# Remove old log files
rm -f hardhat.log schema-server.log
# Remove old PID files
rm -f hardhat.pid schema-server.pid
echo -e "${GREEN}✓ Old data cleaned up${NC}"
echo ""

echo -e "${YELLOW}Step 3: Starting fresh Hardhat node...${NC}"
# Kill any existing Hardhat node
if lsof -Pi :8545 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    EXISTING_PID=$(lsof -Pi :8545 -sTCP:LISTEN -t)
    kill $EXISTING_PID 2>/dev/null || true
    sleep 2
    echo "  Stopped existing Hardhat node (PID: $EXISTING_PID)"
fi

echo "  Starting Hardhat node in background..."
cd contracts
nohup npx hardhat node --hostname 0.0.0.0 > ../hardhat.log 2>&1 &
HARDHAT_PID=$!
echo $HARDHAT_PID > ../hardhat.pid
cd ..
echo -e "${GREEN}✓ Hardhat node started (PID: $HARDHAT_PID)${NC}"
echo "  Waiting for Hardhat to be ready..."
sleep 5
echo ""

echo -e "${YELLOW}Step 4: Starting fresh schema HTTP server...${NC}"
# Kill any existing schema server
if lsof -Pi :8000 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    EXISTING_PID=$(lsof -Pi :8000 -sTCP:LISTEN -t)
    kill $EXISTING_PID 2>/dev/null || true
    sleep 1
    echo "  Stopped existing schema server (PID: $EXISTING_PID)"
fi

echo "  Starting schema HTTP server in background..."
cd schemas
nohup python3 -m http.server 8000 --bind 0.0.0.0 > ../schema-server.log 2>&1 &
SCHEMA_PID=$!
echo $SCHEMA_PID > ../schema-server.pid
cd ..
echo -e "${GREEN}✓ Schema HTTP server started (PID: $SCHEMA_PID)${NC}"
sleep 2
echo ""

echo -e "${YELLOW}Step 5: Deploying smart contracts to Hardhat...${NC}"
cd contracts
echo "  Deploying contracts..."
npx hardhat run scripts/deployIdentityExampleLocalhost.ts --network localhost
if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Contract deployment failed${NC}"
    exit 1
fi

# Read deployment output
DEPLOY_OUTPUT="scripts/deploy_output.json"
if [ ! -f "$DEPLOY_OUTPUT" ]; then
    echo -e "${RED}✗ Deployment output file not found${NC}"
    exit 1
fi

STATE_ADDRESS=$(grep -o '"state": "[^"]*' "$DEPLOY_OUTPUT" | cut -d'"' -f4)
IDENTITY_ADDRESS=$(grep -o '"identity": "[^"]*' "$DEPLOY_OUTPUT" | cut -d'"' -f4)

cd ..
echo -e "${GREEN}✓ Contracts deployed${NC}"
echo "  State contract: $STATE_ADDRESS"
echo "  Identity contract: $IDENTITY_ADDRESS"
echo ""

echo -e "${YELLOW}Step 6: Generating issuer DID from contract address...${NC}"
ISSUER_DID=$(go run utils/convertor.go --contract_address="$IDENTITY_ADDRESS" --network=privado --chain=test | grep -o 'did:iden3:[^[:space:]]*')
echo -e "${GREEN}✓ Issuer DID generated: $ISSUER_DID${NC}"
echo ""

echo -e "${YELLOW}Step 7: Configuring environment variables...${NC}"
# Update .env file with deployed addresses
cat > .env <<EOL
# State contract addresses for different networks
# Hardhat runs on chain 31337, but DIDs use chain 21001 (privado:test)
# Both chain IDs point to the same Hardhat node
SUPPORTED_STATE_CONTRACTS="21001=$STATE_ADDRESS"

# RPC endpoints - using localhost Hardhat node
# Using Docker bridge network gateway to reach host
SUPPORTED_RPC="21001=http://172.21.0.1:8545"

# Issuer private key - using Hardhat's first default account
# IdentityExample contract deployed at: $IDENTITY_ADDRESS
# DID generated from contract address using utils/convertor.go
ISSUERS_PRIVATE_KEY="$ISSUER_DID=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"

# MongoDB connection for storing credentials
MONGODB_CONNECTION_STRING="mongodb://mongodb:27017/credentials"

# External host - for QR code generation
# Ngrok public URL for exposing the demo to the internet
EXTERNAL_HOST="https://unincisive-bruce-exemplarily.ngrok-free.dev"

# Demo mode - skip DID verification for testing (set to "false" for production)
DEMO_MODE="true"

# Credential schemas
NEXT_PUBLIC_DEGREE_SCHEMA_URL="http://172.21.0.1:8000/degree-credential-schema.json"
EOL

# Create .env.local for Next.js build-time environment variables
# IMPORTANT: Must use public URL so mobile wallets can access the schema
cat > client/.env.local <<EOL
NEXT_PUBLIC_DEGREE_SCHEMA_URL=https://unincisive-bruce-exemplarily.ngrok-free.dev/schemas/degree-credential-schema.json
EOL
echo -e "${GREEN}✓ Environment configured${NC}"
echo ""

echo -e "${YELLOW}Step 8: Building and starting Docker containers...${NC}"
docker-compose up -d --build
echo -e "${GREEN}✓ Docker containers built and started${NC}"
echo ""

echo -e "${YELLOW}Step 9: Waiting for services to be ready...${NC}"
echo "  Waiting for MongoDB..."
sleep 5

echo "  Waiting for backend..."
for i in {1..30}; do
    if curl -s http://localhost:8080/api/v1/issuers >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Backend is ready${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${RED}✗ Backend failed to start${NC}"
        echo "  Check logs with: docker-compose logs onchain-merklized-issuer"
        exit 1
    fi
    sleep 2
done

echo "  Waiting for frontend..."
for i in {1..30}; do
    if curl -s http://localhost:3000 >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Frontend is ready${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${RED}✗ Frontend failed to start${NC}"
        echo "  Check logs with: docker-compose logs client"
        exit 1
    fi
    sleep 2
done
echo ""

echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}Deployment completed successfully!${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
echo "Services are running:"
echo "  • Hardhat node:      http://localhost:8545"
echo "  • Schema server:     http://localhost:8000"
echo "  • Backend API:       http://localhost:8080"
echo "  • Frontend:          http://localhost:3000"
echo ""
echo "To check logs:"
echo "  docker-compose logs -f"
echo ""
echo "To stop all services:"
echo "  ./shutdown.sh"
echo ""
