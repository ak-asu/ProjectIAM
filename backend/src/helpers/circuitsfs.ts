import { ICircuitStorage, CircuitId, CircuitData } from '@0xpolygonid/js-sdk';
import * as fs from 'fs';
import * as path from 'path';

export class CircuitsFs implements ICircuitStorage {
  async loadCircuitData(circuitId: CircuitId): Promise<CircuitData> {
    const circuitsDir = path.join(__dirname, '../../circuits');
    const wasmloc = path.join(circuitsDir, `${circuitId}.wasm`);
    const zkeyloc = path.join(circuitsDir, `${circuitId}.zkey`);
    const verifykeyloc = path.join(circuitsDir, `${circuitId}.json`);
    const wasm = fs.readFileSync(wasmloc);
    const provingKey = fs.readFileSync(zkeyloc);
    const verificationKey = fs.readFileSync(verifykeyloc);
    return {
      circuitId,
      wasm,
      provingKey,
      verificationKey,
    };
  }

  async saveCircuitData(circuitId: CircuitId, circuitData: CircuitData): Promise<void> {
    // pass
  }
}
