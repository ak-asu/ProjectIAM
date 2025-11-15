# Deployment Guide

This guide explains how to deploy the OnChain Merklized Issuer Demo.

## Prerequisites

- Docker and Docker Compose installed
- Node.js and npm installed
- Python 3 installed
- ngrok installed and authenticated (for public network access)

## Quick Start

### Deploy Everything

Run the deployment script to start all services:

```bash
./deploy.sh
```

This script will:
1. Stop and remove any existing containers
2. Start the Hardhat blockchain node (if not already running)
3. Start the schema HTTP server (if not already running)
4. Build and start all Docker containers (MongoDB, Backend, Frontend)
5. Wait for all services to be ready
6. Display the URLs for accessing the services

### Shutdown Everything

To stop all services:

```bash
./shutdown.sh
```

This script will:
1. Stop and remove all Docker containers
2. Stop the Hardhat node
3. Stop the schema HTTP server


### 4. Expose Backend to Public Network

If you want to test with a real PolygonID wallet app:

```bash
ngrok http 8080
```

Update the `EXTERNAL_HOST` in `.env` with the ngrok URL, then restart the backend:

```bash
docker-compose restart onchain-merklized-issuer
```

## Service URLs

After deployment, the following services will be available:

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8080
- **Hardhat Node**: http://localhost:8545
- **Schema Server**: http://localhost:8000
- **MongoDB**: localhost:27017

## Environment Variables

Key environment variables in `.env`:

- `SUPPORTED_STATE_CONTRACTS`: State contract addresses for different networks
- `SUPPORTED_RPC`: RPC endpoints for blockchain networks
- `ISSUERS_PRIVATE_KEY`: Issuer's DID and private key
- `MONGODB_CONNECTION_STRING`: MongoDB connection string
- `EXTERNAL_HOST`: Public URL for QR code generation (use ngrok URL)
- `DEMO_MODE`: Set to "true" to skip DID verification for testing
- `NEXT_PUBLIC_DEGREE_SCHEMA_URL`: URL for the degree credential schema

## Testing the Demo

1. Open the frontend at http://localhost:3000
2. Select an issuer from the list
3. Scan the QR code with PolygonID wallet app to authenticate
4. You'll be redirected to the claim page
5. Click "Issue Degree Credential" to create the credential
6. Scan the QR code to receive the credential in your wallet

## Demo Mode

When `DEMO_MODE="true"`, the system:
- Skips real DID verification during authentication
- Generates demo DIDs automatically
- Allows testing without a real PolygonID wallet for authentication

Set `DEMO_MODE="false"` for production use with real DID verification.

## Troubleshooting

### Check Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f onchain-merklized-issuer
docker-compose logs -f client

# Hardhat node
tail -f hardhat.log

# Schema server
tail -f schema-server.log
```

### Check Service Status

```bash
docker-compose ps
```

### Restart a Service

```bash
docker-compose restart <service-name>
```

### Rebuild a Service

```bash
docker-compose up -d --build <service-name>
```

### Common Issues

1. **Port already in use**: Make sure no other services are using ports 3000, 8000, 8080, 8545, or 27017
2. **Docker containers not starting**: Check logs with `docker-compose logs`
3. **Schema not found error**: Verify the schema HTTP server is running on port 8000
4. **Blockchain connection error**: Ensure Hardhat node is running on port 8545

## Clean Up

To remove all containers, volumes, and networks:

```bash
docker-compose down -v
```

To also remove the blockchain data:

```bash
rm -rf data/
```
