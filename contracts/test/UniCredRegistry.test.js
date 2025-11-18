const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('UniCredRegistry', function () {
  let registry, admin, issuer, other;
  const issuerDID = 'did:polygonid:polygon:amoy:2qFUniversityTest';
  const holderDID = 'did:polygonid:polygon:amoy:2qFStudentTest';

  beforeEach(async function () {
    [admin, issuer, , other] = await ethers.getSigners();
    const UniCredRegistry = await ethers.getContractFactory('UniCredRegistry');
    registry = await UniCredRegistry.deploy();
    await registry.waitForDeployment();
  });

  describe('Issuer Management', function () {
    it('admin can register issuer', async function () {
      await expect(registry.connect(admin).registerIssuer(issuerDID, issuer.address, 'ASU'))
        .to.emit(registry, 'IssuerRegistered')
        .withArgs(issuerDID, issuer.address, 'ASU');
      const data = await registry.getIssuer(issuerDID);
      expect(data.isActive).to.be.true;
    });

    it('non-admin cannot register issuer', async function () {
      await expect(
        registry.connect(other).registerIssuer(issuerDID, issuer.address, 'ASU')
      ).to.be.revertedWith('Caller is not admin');
    });

    it('prevents duplicate issuer registration', async function () {
      await registry.connect(admin).registerIssuer(issuerDID, issuer.address, 'ASU');
      await expect(
        registry.connect(admin).registerIssuer(issuerDID, issuer.address, 'ASU')
      ).to.be.revertedWith('already registered');
    });

    it('can deactivate and reactivate issuer', async function () {
      await registry.connect(admin).registerIssuer(issuerDID, issuer.address, 'ASU');
      await registry.connect(admin).deactivateIssuer(issuerDID);
      expect((await registry.getIssuer(issuerDID)).isActive).to.be.false;
      await registry.connect(admin).reactivateIssuer(issuerDID);
      expect((await registry.getIssuer(issuerDID)).isActive).to.be.true;
    });
  });

  describe('Credential Issuance', function () {
    const credHash = ethers.keccak256(ethers.toUtf8Bytes('test-cred-data'));
    const merkleRoot = ethers.keccak256(ethers.toUtf8Bytes('merkle-root'));
    const ipfsCID = 'QmTest1234567890';
    const oneYearFromNow = () => Math.floor(Date.now() / 1000) + 31536000;

    beforeEach(async function () {
      await registry.connect(admin).registerIssuer(issuerDID, issuer.address, 'ASU');
    });

    it('issuer can issue credential', async function () {
      await expect(
        registry.connect(issuer).issueCredential(holderDID, credHash, merkleRoot, ipfsCID, oneYearFromNow())
      ).to.emit(registry, 'CredentialIssued');
      expect(await registry.getTotalIssuedCredentials()).to.equal(1);
    });

    it('non-issuer cannot issue credential', async function () {
      await expect(
        registry.connect(other).issueCredential(holderDID, credHash, merkleRoot, ipfsCID, oneYearFromNow())
      ).to.be.revertedWith('Not a registered issuer');
    });

    it('validates inputs', async function () {
      const expires = oneYearFromNow();
      await expect(
        registry.connect(issuer).issueCredential('', credHash, merkleRoot, ipfsCID, expires)
      ).to.be.revertedWith('Holder DID cannot be empty');
      await expect(
        registry.connect(issuer).issueCredential(holderDID, ethers.ZeroHash, merkleRoot, ipfsCID, expires)
      ).to.be.revertedWith('hash cannot be zero');
    });
  });

  describe('Credential Revocation', function () {
    let credId;
    const credHash = ethers.keccak256(ethers.toUtf8Bytes('test-cred-data'));
    const merkleRoot = ethers.keccak256(ethers.toUtf8Bytes('merkle-root'));
    const ipfsCID = 'QmTest1234567890';

    beforeEach(async function () {
      await registry.connect(admin).registerIssuer(issuerDID, issuer.address, 'ASU');
      const tx = await registry.connect(issuer).issueCredential(
        holderDID, credHash, merkleRoot, ipfsCID,
        Math.floor(Date.now() / 1000) + 31536000
      );
      const receipt = await tx.wait();
      credId = receipt.logs.find(log => log.fragment?.name === 'CredentialIssued').args[0];
    });

    it('issuer can revoke credential', async function () {
      await registry.connect(issuer).revokeCredential(credId, 'Degree invalidated');
      const cred = await registry.getCredential(credId);
      expect(cred.isRevoked).to.be.true;
    });

    it('cannot revoke twice', async function () {
      await registry.connect(issuer).revokeCredential(credId, 'First');
      await expect(
        registry.connect(issuer).revokeCredential(credId, 'Second')
      ).to.be.revertedWith('already revoked');
    });
  });

  describe('Credential Verification', function () {
    let credId;
    const credHash = ethers.keccak256(ethers.toUtf8Bytes('test-cred-data'));
    const merkleRoot = ethers.keccak256(ethers.toUtf8Bytes('merkle-root'));
    const ipfsCID = 'QmTest1234567890';

    beforeEach(async function () {
      await registry.connect(admin).registerIssuer(issuerDID, issuer.address, 'ASU');
      const tx = await registry.connect(issuer).issueCredential(
        holderDID, credHash, merkleRoot, ipfsCID,
        Math.floor(Date.now() / 1000) + 31536000
      );
      const receipt = await tx.wait();
      credId = receipt.logs.find(log => log.fragment?.name === 'CredentialIssued').args[0];
    });

    it('validates active credentials', async function () {
      const [isValid] = await registry.isCredentialValid(credId);
      expect(isValid).to.be.true;
    });

    it('rejects revoked credentials', async function () {
      await registry.connect(issuer).revokeCredential(credId, 'Revoked');
      const [isValid] = await registry.isCredentialValid(credId);
      expect(isValid).to.be.false;
    });

    it('verifies hash correctly', async function () {
      expect(await registry.verifyCredentialHash(credId, credHash)).to.be.true;
      expect(await registry.verifyCredentialHash(credId, ethers.keccak256(ethers.toUtf8Bytes('wrong')))).to.be.false;
    });
  });

  describe('Merkle Root Updates', function () {
    let credId;
    const credHash = ethers.keccak256(ethers.toUtf8Bytes('test-cred-data'));
    const merkleRoot = ethers.keccak256(ethers.toUtf8Bytes('merkle-root'));
    const newMerkleRoot = ethers.keccak256(ethers.toUtf8Bytes('new-merkle-root'));
    const ipfsCID = 'QmTest1234567890';

    beforeEach(async function () {
      await registry.connect(admin).registerIssuer(issuerDID, issuer.address, 'ASU');
      const tx = await registry.connect(issuer).issueCredential(
        holderDID, credHash, merkleRoot, ipfsCID,
        Math.floor(Date.now() / 1000) + 31536000
      );
      const receipt = await tx.wait();
      credId = receipt.logs.find(log => log.fragment?.name === 'CredentialIssued').args[0];
    });

    it('issuer can update merkle root', async function () {
      await registry.connect(issuer).updateMerkleRoot(credId, newMerkleRoot);
      expect((await registry.getCredential(credId)).merkleRoot).to.equal(newMerkleRoot);
    });

    it('cannot update revoked credential', async function () {
      await registry.connect(issuer).revokeCredential(credId, 'Revoked');
      await expect(
        registry.connect(issuer).updateMerkleRoot(credId, newMerkleRoot)
      ).to.be.revertedWith('Cannot update revoked credential');
    });
  });

  describe('Admin Functions', function () {
    it('can transfer admin role', async function () {
      await registry.connect(admin).transferAdmin(other.address);
      expect(await registry.admin()).to.equal(other.address);
    });

    it('rejects zero address transfer', async function () {
      await expect(
        registry.connect(admin).transferAdmin(ethers.ZeroAddress)
      ).to.be.revertedWith('Invalid admin address');
    });
  });
});
