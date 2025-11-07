package main

import (
	"encoding/hex"
	"flag"
	"fmt"
	"log"
	"strings"

	core "github.com/iden3/go-iden3-core/v2"
)

var contractAddress = flag.String("contract_address", "", "Contract address for converting to DID")

func main() {
	flag.Parse()
	if *contractAddress == "" {
		log.Fatalln("contract_address is required flag")
	}

	ethAddrHex := strings.TrimPrefix(*contractAddress, "0x")

	const didMethod = core.DIDMethodIden3
	genesis := genFromHex("00000000000000" + ethAddrHex)

	// For local Hardhat (chain 31337), we'll use the privado:test network type
	// which is chain 21001, but we'll configure the backend to map it to 31337
	tp, err := core.BuildDIDType(
		didMethod,
		core.Blockchain("privado"),
		core.NetworkID("test"))
	if err != nil {
		log.Fatalf("failed to build DID type: %v", err)
	}
	id0 := core.NewID(tp, genesis)

	s := fmt.Sprintf("did:%s:%s:%s:%v",
		didMethod, "privado", "test", id0.String())
	fmt.Println(s)
}

func genFromHex(gh string) [27]byte {
	genBytes, err := hex.DecodeString(gh)
	if err != nil {
		panic(err)
	}
	var gen [27]byte
	copy(gen[:], genBytes)
	return gen
}
