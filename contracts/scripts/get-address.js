import { Wallet } from "ethers";

// node get-address.js

const pk = "private-key-here";  
const wallet = new Wallet(pk);

console.log(wallet.address);
