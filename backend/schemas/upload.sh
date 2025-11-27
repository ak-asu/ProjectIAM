#!/bin/bash

# Upload DegreeCredential schema to Pinata IPFS

if [ -z "$PINATA_JWT" ]; then
  echo "Error: PINATA_JWT environment variable not set"
  exit 1
fi

RESP=$(curl -s -X POST "https://api.pinata.cloud/pinning/pinJSONToIPFS" \
  -H "Authorization: Bearer $PINATA_JWT" \
  -H "Content-Type: application/json" \
  -d @schemas/DegreeCredential-v1.json-ld)

IPFS_HASH=$(echo $RESP | grep -o '"IpfsHash":"[^"]*"' | sed 's/"IpfsHash":"//;s/"$//')

if [ -z "$IPFS_HASH" ]; then
    echo "Failed: $RESP"
    exit 1
fi

echo "IPFS Hash: $IPFS_HASH"
