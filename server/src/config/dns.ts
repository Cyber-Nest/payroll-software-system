import dns from 'dns';
import { env } from './env';

export function configureDns(): void {
  if (env.dnsServers.length > 0) {
    dns.setServers(env.dnsServers);
  }
}
