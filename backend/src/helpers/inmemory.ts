import { IDataSource } from '@0xpolygonid/js-sdk';
import { IMerkleTreeStorage, IdentityMerkleTreeMetaInformation, MerkleTreeType } from '@0xpolygonid/js-sdk';
import { Merkletree, InMemoryDB, str2Bytes } from '@iden3/js-merkletree';

export class InMemoryStroage<T> implements IDataSource<T> {
  private data: Map<string, T> = new Map();

  async get(key: string): Promise<T | undefined> {
    return this.data.get(key);
  }

  async load(): Promise<T[]> {
    return Array.from(this.data.values());
  }

  async save(key: string, value: T): Promise<void> {
    this.data.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }
}

export class InMemoryMerkleTree implements IMerkleTreeStorage {
  private trees: Map<string, { tree: Merkletree; type: MerkleTreeType; identifier: string }> = new Map();
  private mtDepth: number;

  constructor(mtDepth: number) {
    this.mtDepth = mtDepth;
  }

  async createIdentityMerkleTrees(identifier: string): Promise<IdentityMerkleTreeMetaInformation[]> {
    const treesmeta: IdentityMerkleTreeMetaInformation[] = [];
    const types = [MerkleTreeType.Claims, MerkleTreeType.Revocations, MerkleTreeType.Roots];
    for (const t of types) {
      const treeId = identifier + '+' + t.toString();
      const db = new InMemoryDB(str2Bytes(treeId));
      const tree = new Merkletree(db, true, this.mtDepth);
      this.trees.set(treeId, { tree, type: t, identifier });
      treesmeta.push({ treeId, identifier, type: t });
    }
    return treesmeta;
  }

  async addToMerkleTree(
    identifier: string,
    mtType: MerkleTreeType,
    hindex: bigint,
    hvalue: bigint
  ): Promise<void> {
    const treeId = identifier + '+' + mtType.toString();
    const item = this.trees.get(treeId);
    if (!item) throw new Error(`No tree ${treeId}`);
    await item.tree.add(hindex, hvalue);
  }

  async getMerkleTreeByIdentifierAndType(
    identifier: string,
    mtType: MerkleTreeType
  ): Promise<Merkletree> {
    const treeId = identifier + '+' + mtType.toString();
    const item = this.trees.get(treeId);
    if (!item) throw new Error(`No tree ${treeId}`);
    return item.tree;
  }

  async bindMerkleTreeToNewIdentifier(oldIdentifier: string, newIdentifier: string): Promise<void> {
    const types = [MerkleTreeType.Claims, MerkleTreeType.Revocations, MerkleTreeType.Roots];
    for (const t of types) {
        const oldtreeId = oldIdentifier + '+' + t.toString();
        const newtreeId = newIdentifier + '+' + t.toString();
        const item = this.trees.get(oldtreeId);
        if (item) {
            this.trees.set(newtreeId, { ...item, identifier: newIdentifier });
            this.trees.delete(oldtreeId); // Generally for binding move ownership
        }
    }
  }
}
