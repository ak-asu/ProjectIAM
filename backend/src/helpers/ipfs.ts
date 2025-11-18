import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';
import { config } from '../config';

export class IPFSService {
  async upload(data: any, encrypt = true, holderDID?: string) {
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
    const jsonData = JSON.stringify(dataToUpload);
    const cid = this.generateCID(jsonData);
    return cid;
  }

  async fetch(cid: string, holderDID?: string) {
    const data = {
      encrypted: false,
      data: '',
      iv: '',
      tag: '',
    };
    if (data.encrypted && holderDID && data.iv && data.tag) {
      return this.decryptData(
        data.data,
        data.iv,
        data.tag,
        holderDID
      );
    }
    return data.data || data;
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

  private deriveKey(holderDID: string) {
    const secret = config.encryptionSecret;
    const combined = `${secret}:${holderDID}`;
    return createHash('sha256').update(combined).digest();
  }

  private generateCID(data: string) {
    const hash = createHash('sha256').update(data).digest('hex');
    return `Qm${hash.substring(0, 44)}`;
  }

  getGatewayUrl(cid: string) {
    const gateway = config.ipfsGateway;
    return `${gateway}/ipfs/${cid}`;
  }
}

let ipfsService: IPFSService | null = null;

export function getIPFSService() {
  if (!ipfsService) {
    ipfsService = new IPFSService();
  }
  return ipfsService;
}
