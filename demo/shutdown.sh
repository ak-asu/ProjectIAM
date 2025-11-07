#!/bin/bash

set -e

echo "========================================="
echo "Shutting down OnChain Merklized Issuer Demo"
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

echo -e "${YELLOW}Step 1: Stopping Docker containers...${NC}"
docker-compose down
echo -e "${GREEN}✓ Docker containers stopped${NC}"
echo ""

echo -e "${YELLOW}Step 2: Stopping Hardhat node...${NC}"
if [ -f hardhat.pid ]; then
    HARDHAT_PID=$(cat hardhat.pid)
    if ps -p $HARDHAT_PID > /dev/null 2>&1; then
        kill $HARDHAT_PID
        echo -e "${GREEN}✓ Hardhat node stopped (PID: $HARDHAT_PID)${NC}"
    else
        echo -e "${YELLOW}Hardhat node (PID: $HARDHAT_PID) is not running${NC}"
    fi
    rm hardhat.pid
else
    # Try to kill by port if PID file doesn't exist
    if lsof -Pi :8545 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
        HARDHAT_PID=$(lsof -Pi :8545 -sTCP:LISTEN -t)
        kill $HARDHAT_PID
        echo -e "${GREEN}✓ Hardhat node stopped (PID: $HARDHAT_PID)${NC}"
    else
        echo -e "${YELLOW}Hardhat node is not running${NC}"
    fi
fi
echo ""

echo -e "${YELLOW}Step 3: Stopping schema HTTP server...${NC}"
if [ -f schema-server.pid ]; then
    SCHEMA_PID=$(cat schema-server.pid)
    if ps -p $SCHEMA_PID > /dev/null 2>&1; then
        kill $SCHEMA_PID
        echo -e "${GREEN}✓ Schema HTTP server stopped (PID: $SCHEMA_PID)${NC}"
    else
        echo -e "${YELLOW}Schema HTTP server (PID: $SCHEMA_PID) is not running${NC}"
    fi
    rm schema-server.pid
else
    # Try to kill by port if PID file doesn't exist
    if lsof -Pi :8000 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
        SCHEMA_PID=$(lsof -Pi :8000 -sTCP:LISTEN -t)
        kill $SCHEMA_PID
        echo -e "${GREEN}✓ Schema HTTP server stopped (PID: $SCHEMA_PID)${NC}"
    else
        echo -e "${YELLOW}Schema HTTP server is not running${NC}"
    fi
fi
echo ""

echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}Shutdown completed successfully!${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
