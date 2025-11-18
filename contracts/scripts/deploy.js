const hardhat = require('hardhat');
const fs = require('fs');
const path = require('path');

async function main() {
  const [deployer] = await hardhat.ethers.getSigners();
  const balance = await hardhat.ethers.provider.getBalance(deployer.address);
  console.log('Deploying from:', deployer.address);
  console.log('Balance:', hardhat.ethers.formatEther(balance), 'MATIC');
  const UniCredRegistry = await hardhat.ethers.getContractFactory('UniCredRegistry');
  const registry = await UniCredRegistry.deploy();
  await registry.waitForDeployment();
  const addr = await registry.getAddress();
  console.log('Contract deployed at:', addr);
  console.log('Admin:', await registry.admin());
  const info = {
    network: hardhat.network.name,
    chainId: hardhat.network.config.chainId,
    contractAddress: addr,
    adminAddress: deployer.address,
    deployedAt: new Date().toISOString(),
    blockNumber: await hardhat.ethers.provider.getBlockNumber(),
  };
  const outDir = path.join(__dirname, '../deployments');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, `${hardhat.network.name}-deploy.json`),
    JSON.stringify(info, null, 2)
  );
  if (hardhat.network.name !== 'hardhat' && hardhat.network.name !== 'localhost') {
    console.log('Waiting 35s for block confirmations');
    await new Promise(r => setTimeout(r, 35000));
    try {
      await hardhat.run('verify:verify', {
        address: addr,
        constructorArguments: [],
      });
      console.log('Verified on Polygonscan!');
    } catch (err) {
      console.log('Auto-verification failed:', err.message);
      console.log(`Hence run manually: npx hardhat verify --network ${hardhat.network.name} ${addr}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Failed Deployment:', error);
    process.exit(1);
  });
