// Test-process preload only: real HTTP sync composition with a failed scanner boundary.
import './omni-network.mjs';
import { InpiService } from '../../lib/inpi/inpi-service.mjs';
InpiService.prototype.runScan = async function () {
  throw new Error('Synthetic RPI scanner failure');
};
