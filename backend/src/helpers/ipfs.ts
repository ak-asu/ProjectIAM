import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';
import { config } from '../config';

export class IPFSService {
  private getAuthHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${config.pinataJwt}`,
      'Content-Type': 'application/json',
    };
  }

  async upload(data: any, encrypt = true, holderDID?: string): Promise<string> {
    let dataToUpload: any;
    if (encrypt && holderDID) {
      const encrypted = this.encryptData(data, holderDID);
      dataToUpload = {
        encrypted: true,
        data: encrypted.encryptedData,
        iv: encrypted.iv,
        tag: encrypted.tag,
      };
    } else {
      dataToUpload = data;
    }
    const pinataUrl = `${config.ipfsApiUrl}/pinning/pinJSONToIPFS`;
    const response = await fetch(pinataUrl, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({
        pinataContent: dataToUpload,
        pinataMetadata: {
          name: `credential-${Date.now()}`,
        },
        pinataOptions: {
          cidVersion: 0,
        },
      }),
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Pinata upload failed: ${response.status} - ${error}`);
    }
    const result = await response.json() as { IpfsHash?: string };
    if (!result.IpfsHash) {
      throw new Error('IpfsHash is missing');
    }
    return result.IpfsHash;
  }

  async fetch(cid: string, holderDID?: string): Promise<any> {
    const gatewayUrl = `${config.ipfsGateway}/ipfs/${cid}`;
    const response = await fetch(gatewayUrl);
    if (!response.ok) {
      throw new Error(`IPFS fetch failed: ${response.status} - ${response.statusText}`);
    }
    const data = await response.json() as { encrypted?: boolean; data?: string; iv?: string; tag?: string };
    if (data.encrypted && holderDID && data.iv && data.tag && data.data) {
      return this.decryptData(data.data, data.iv, data.tag, holderDID);
    }
    return data.data || data;
  }

  async pin(cid: string): Promise<boolean> {
    const pinataUrl = `${config.ipfsApiUrl}/pinning/pinByHash`;
    const response = await fetch(pinataUrl, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({
        hashToPin: cid,
        pinataMetadata: {
          name: `pinned-${Date.now()}`,
        },
      }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Pinata pin failed: ${response.status} - ${errorText}`);
      return false;
    }
    return true;
  }

  async unpin(cid: string): Promise<boolean> {
    const pinataUrl = `${config.ipfsApiUrl}/pinning/unpin/${cid}`;
    const response = await fetch(pinataUrl, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
    });
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Pinata unpin failed: ${response.status} - ${errorText}`);
      return false;
    }
    return true;
  }

  private encryptData(
    data: any,
    holderDID: string
  ): { encryptedData: string; iv: string; tag: string } {
    const key = this.deriveKey(holderDID);
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const jsonData = JSON.stringify(data);
    let encrypted = cipher.update(jsonData, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag();
    return {
      encryptedData: encrypted,
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
    };
  }

  private decryptData(
    encryptedData: string,
    ivHex: string,
    tagHex: string,
    holderDID: string
  ): any {
    const key = this.deriveKey(holderDID);
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
  }

  private deriveKey(holderDID: string): Buffer {
    const combined = `${config.encryptionSecret}:${holderDID}`;
    return createHash('sha256').update(combined).digest();
  }
}

let ipfsService: IPFSService | null = null;

export function getIPFSService(): IPFSService {
  if (!ipfsService) {
    ipfsService = new IPFSService();
  }
  return ipfsService;
}
