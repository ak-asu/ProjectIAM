# Onchain merklized issuer demo


### Quick Start Installation

**Requirements:**
- Docker
- Docker-compose
- Ngrok

**Steps to run:**

1. Deploy the [on-chain merklized issuer contract](https://github.com/0xPolygonID/contracts/blob/main/contracts/examples/IdentityExample.sol). [Script to deploy](https://github.com/0xPolygonID/contracts/blob/main/scripts/deployIdentityExample.ts) or use the [npm command](https://github.com/0xPolygonID/contracts/blob/d308e1f586ea177005b34872992d16c3cb20e474/package.json#L60).

2. Copy `.env.example` to `.env`
    ```sh
    cp .env.example .env
    ```

3. Run `ngrok` on 8080 port.
    ```sh
    ngrok http 8080
    ```

4. Use the utility to calculate the issuerDID from the smart contract address:
    ```bash
    go run utils/convertor.go --contract_address=<ADDRESS_OF_ONCHAIN_ISSUER_CONTRACT>
    ```
    Available flags:
    - `contract_address` - contract address that will convert to did
    - `network` - network of the contract. Default: **polygon**
    - `chain` - chain of the contract. Default: **amoy**

5. Fill the `.env` config file with the proper variables:
    ```bash
    SUPPORTED_RPC="80002=<RPC_POLYGON_AMOY>"
    ISSUERS_PRIVATE_KEY="<ISSUER_DID>=<PRIVATE_KEY_OF_THE_CONTRACT_DEPLOYER>"
    EXTERNAL_HOST="<NGROK_URL>"
    ```
    `ISSUERS_PRIVATE_KEY` supports a list of issuers in the format `"issuerDID=ket,issuerDID2=key2"`

6. Use the docker-compose file:
    ```bash
    docker-compose build
    docker-compose up -d
    ```

7. Open: http://localhost:3000
