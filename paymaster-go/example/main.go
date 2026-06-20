package main

import (
	"context"
	"fmt"
	"log"

	"github.com/Stellar-Fluid/fluid/fluid-go"
	"github.com/stellar/go/keypair"
	"github.com/stellar/go/network"
	"github.com/stellar/go/txnbuild"
)

func main() {
	// Initialize Fluid client
	client := fluid.NewClient("http://localhost:3000", "your-api-key")

	// 1. Create a transaction using txnbuild
	sourceKP, _ := keypair.ParseFull("S...") // Replace with actual secret
	
	// Create a simple payment operation
	paymentOp := txnbuild.Payment{
		Destination: "G...", // Replace with actual destination
		Amount:      "10.0",
		Asset:       txnbuild.NativeAsset{},
	}

	tx, err := txnbuild.NewTransaction(
		txnbuild.TransactionParams{
			SourceAccount:        &txnbuild.SimpleAccount{AccountID: sourceKP.Address(), Sequence: 1},
			IncrementSequenceNum: true,
			Operations:           []txnbuild.Operation{&paymentOp},
			BaseFee:              txnbuild.MinBaseFee,
			Preconditions:        txnbuild.Preconditions{TimeBounds: txnbuild.NewInfiniteTimeout()},
		},
	)
	if err != nil {
		log.Fatal(err)
	}

	// 2. Sign the transaction
	tx, err = tx.Sign(network.TestNetworkPassphrase, sourceKP)
	if err != nil {
		log.Fatal(err)
	}

	// 3. Request fee-bump from Fluid server
	fmt.Println("Requesting fee-bump for transaction...")
	resp, err := client.BuildAndRequestFeeBump(context.Background(), tx, false)
	if err != nil {
		log.Fatalf("Fee-bump request failed: %v", err)
	}

	fmt.Printf("Received fee-bumped XDR: %s\n", resp.XDR)
	fmt.Printf("Fee Payer: %s\n", resp.FeePayer)
}
