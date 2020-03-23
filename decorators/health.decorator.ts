import { ExternalServiceNames } from '../modules/health/health.interface';
import { HealthService } from '../modules/health/health.service';

const healthService = new HealthService();
export function healthDecorator(serviceName: ExternalServiceNames) {
  return function(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const value = async function(this: { value: (...args: any[]) => Promise<any> }, ...args: any[]) {
      try {
        const result = await originalMethod.apply(this, args);
        healthService.setOperation(serviceName, true);
        return result;
      } catch (e) {
        healthService.setOperation(serviceName, false);
        throw e;
      }
    };
    Object.assign(descriptor, { value });
  };
}
