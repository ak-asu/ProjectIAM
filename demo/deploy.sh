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

echo -e "${YELLOW}Step 1: Stopping and removing existing containers...${NC}"
docker-compose down
echo -e "${GREEN}✓ Containers stopped and removed${NC}"
echo ""

echo -e "${YELLOW}Step 2: Checking Hardhat node...${NC}"
if lsof -Pi :8545 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo -e "${GREEN}✓ Hardhat node is already running on port 8545${NC}"
else
    echo "Starting Hardhat node in background..."
    cd contracts
    nohup npx hardhat node --hostname 0.0.0.0 > ../hardhat.log 2>&1 &
    HARDHAT_PID=$!
    echo $HARDHAT_PID > ../hardhat.pid
    cd ..
    echo -e "${GREEN}✓ Hardhat node started (PID: $HARDHAT_PID)${NC}"
    echo "  Waiting for Hardhat to be ready..."
    sleep 5
fi
echo ""

echo -e "${YELLOW}Step 3: Checking schema HTTP server...${NC}"
if lsof -Pi :8000 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo -e "${GREEN}✓ Schema HTTP server is already running on port 8000${NC}"
else
    echo "Starting schema HTTP server in background..."
    cd schemas
    nohup python3 -m http.server 8000 --bind 0.0.0.0 > ../schema-server.log 2>&1 &
    SCHEMA_PID=$!
    echo $SCHEMA_PID > ../schema-server.pid
    cd ..
    echo -e "${GREEN}✓ Schema HTTP server started (PID: $SCHEMA_PID)${NC}"
    sleep 2
fi
echo ""

echo -e "${YELLOW}Step 4: Creating client environment configuration...${NC}"
# Create .env.local for Next.js build-time environment variables
cat > client/.env.local <<EOL
NEXT_PUBLIC_DEGREE_SCHEMA_URL=http://172.21.0.1:8000/degree-credential-schema.json
EOL
echo -e "${GREEN}✓ Client environment configured${NC}"
echo ""

echo -e "${YELLOW}Step 5: Building and starting Docker containers...${NC}"
docker-compose up -d --build
echo -e "${GREEN}✓ Docker containers built and started${NC}"
echo ""

echo -e "${YELLOW}Step 6: Waiting for services to be ready...${NC}"
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
